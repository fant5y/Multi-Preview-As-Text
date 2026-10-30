import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "multipreviewastext.MultiPreviewAny",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "MultiPreviewAny") return;

        const original_onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            original_onNodeCreated?.apply(this, arguments);

            while (this.outputs && this.outputs.length > 0) {
                this.removeOutput(0);
            }

            this.resizable = true;
            try {
                create_preview_widget(this);
                update_dynamic_inputs(this);
                // Discard the temporary height allocated for the 100 schema outputs.
                this.setSize(this.computeSize());
            } catch (error) {
                console.error("[MultiPreviewAny] onNodeCreated error:", error);
            }
        };

        const original_onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            original_onConfigure?.apply(this, arguments);
            const text_widget = this.widgets?.find(w => w.name === "preview_output");
            if (text_widget) {
                text_widget.value = "(no output)";
            }
            update_dynamic_inputs(this);
        };

        nodeType.prototype.onExecuted = function (message) {
            try {
                const text_widget = this.widgets?.find(w => w.name === "preview_output");
                if (!text_widget) return;

                text_widget.setPreviewEntries(get_preview_entries(this, message));

                requestAnimationFrame(() => {
                    const input_el = text_widget.element;
                    if (!input_el) return;

                    const context = document.createElement("canvas").getContext("2d");
                    context.font = getComputedStyle(input_el).font;
                    let text_width = 0;
                    for (const line of text_widget.value.split("\n")) {
                        text_width = Math.max(text_width, context.measureText(line).width);
                    }
                    const minimum_size = this.computeSize();
                    this.setSize([
                        Math.max(this.size[0], minimum_size[0], Math.min(1000, Math.max(400, Math.ceil(text_width) + 80))),
                        Math.max(this.size[1], minimum_size[1]),
                    ]);
                    this.setDirtyCanvas(true, true);

                    // Let ComfyUI lay out the wider textarea before measuring wrapped lines.
                    requestAnimationFrame(() => {
                        const overflow = Math.max(0, input_el.scrollHeight - input_el.clientHeight);
                        this.setSize([this.size[0], this.size[1] + overflow]);
                        this.setDirtyCanvas(true, true);
                    });
                });

            } catch (error) {
                console.error("[MultiPreviewAny] onExecuted error:", error);
            }
        };

        const original_onConnectInput = nodeType.prototype.onConnectInput;
        nodeType.prototype.onConnectInput = function (slot_index, type, output, origin_node, origin_slot) {
            const allowed = original_onConnectInput?.apply(this, arguments);
            if (allowed === false || this.swapping_inputs) return allowed;

            const graph = this.graph ?? app.graph;
            const displaced_link = graph?.links[this.inputs[slot_index]?.link];
            const moving_link = app.canvas?.linkConnector?.renderLinks?.find(link =>
                link.toType === "input" && link.inputNode === this &&
                link.outputNode === origin_node && link.outputIndex === origin_slot
            );
            const previous_slot = this.inputs.indexOf(moving_link?.inputSlot);
            if (previous_slot < 0 || previous_slot === slot_index ||
                this.inputs[previous_slot].link != null) return allowed;

            if (displaced_link) {
                // Fill the vacated slot before LiteGraph replaces the destination wire.
                this.swapping_inputs = true;
                try {
                    const displaced_origin = graph.getNodeById(displaced_link.origin_id);
                    const restored = displaced_origin?.connect(
                        displaced_link.origin_slot, this, previous_slot, displaced_link.parentId
                    );
                    if (!restored) return false;
                } finally {
                    this.swapping_inputs = false;
                }
            }
            this.pending_output_move = {
                from: previous_slot, to: slot_index,
                origin_id: origin_node.id, origin_slot,
            };
            return allowed;
        };

        const original_onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (
            connection_type, slot_index, is_connected, link_info, input_info
        ) {
            if (this.ignore_connections_change) return;
            original_onConnectionsChange?.apply(this, arguments);

            if (connection_type === 1 && !is_connected && this.inputs?.[slot_index]) {
                this.inputs[slot_index].type = "*";
            }
            if (this.connection_update_pending) return;
            this.connection_update_pending = true;

            const finish_update = () => {
                // Keep slot objects and indices stable until LiteGraph finishes moving the wire.
                if (app.canvas?.linkConnector?.isConnecting) {
                    requestAnimationFrame(finish_update);
                    return;
                }
                this.connection_update_pending = false;
                this.ignore_connections_change = true;
                try {
                    const move = this.pending_output_move;
                    delete this.pending_output_move;
                    const graph = this.graph ?? app.graph;
                    const destination = move && graph?.links[this.inputs[move.to]?.link];
                    if (destination && destination.origin_id === move.origin_id &&
                        destination.origin_slot === move.origin_slot) {
                        // Native links are read by slot index, so capture them before moving outputs.
                        const from_links = [...(this.outputs[move.from]?.links || [])];
                        const to_links = [...(this.outputs[move.to]?.links || [])];
                        [this.outputs[move.from], this.outputs[move.to]] =
                            [this.outputs[move.to], this.outputs[move.from]];
                        for (const [index, link_ids] of [[move.to, from_links], [move.from, to_links]]) {
                            for (const link_id of link_ids) {
                                const link = graph.links[link_id];
                                if (link) link.origin_slot = index;
                            }
                        }
                    }
                    update_dynamic_inputs(this);
                } finally {
                    this.ignore_connections_change = false;
                }
            };
            requestAnimationFrame(finish_update);
        };
    },
});

function create_preview_widget(node) {
    const container = document.createElement("div");
    container.className = "multi-preview-panels";
    Object.assign(container.style, {
        display: "flex", flexDirection: "column", gap: "10px", height: "100%",
        minHeight: "0", overflow: "auto", boxSizing: "border-box", paddingBottom: "12px",
        font: "15px monospace", color: "var(--input-text, #ddd)",
    });
    const toolbar = document.createElement("div");
    Object.assign(toolbar.style, { display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "8px", flexShrink: "0" });
    const panels = document.createElement("div");
    Object.assign(panels.style, { display: "flex", flexDirection: "column", gap: "12px", flexShrink: "0" });
    const state = { value: "(no output)", entries: [{ header: "", text: "(no output)" }], folded: new Set() };
    const copy_all = create_copy_button("Copy all", () => state.value);
    copy_all.className = "multi-preview-copy-all";
    const fold_all = create_preview_button("Fold all");
    fold_all.className = "multi-preview-fold-all";
    const unfold_all = create_preview_button("Unfold all");
    unfold_all.className = "multi-preview-unfold-all";
    const set_all_open = open => {
        for (const panel of panels.children) {
            if (panel.tagName !== "DETAILS") continue;
            panel.open = open;
            if (open) state.folded.delete(panel.dataset.header);
            else state.folded.add(panel.dataset.header);
        }
    };
    fold_all.addEventListener("click", () => set_all_open(false));
    unfold_all.addEventListener("click", () => set_all_open(true));
    toolbar.append(fold_all, unfold_all, copy_all);
    container.append(toolbar, panels);
    container.addEventListener("pointerdown", event => event.stopPropagation());
    container.addEventListener("contextmenu", event => event.stopPropagation());
    container.addEventListener("wheel", event => {
        if (!event.ctrlKey && container.scrollHeight > container.clientHeight) event.stopPropagation();
    });

    const render = () => {
        panels.replaceChildren();
        for (const entry of state.entries) {
            const panel = document.createElement(entry.header ? "details" : "section");
            panel.className = "multi-preview-panel";
            Object.assign(panel.style, {
                border: `1px solid ${entry.color || "#555"}`, borderLeftWidth: "3px",
                borderRadius: "5px", background: "var(--comfy-input-bg, #222)", overflow: "hidden",
            });
            if (entry.header) {
                panel.dataset.header = entry.header;
                panel.open = !state.folded.has(entry.header);
                const header = document.createElement("summary");
                Object.assign(header.style, {
                    display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 12px",
                    borderBottom: "1px solid #ffffff18", background: "#ffffff06", cursor: "pointer",
                });
                const title = document.createElement("span");
                title.textContent = entry.header;
                Object.assign(title.style, { flex: "1", minWidth: "0", overflowWrap: "anywhere", color: entry.color || "inherit" });
                const arrow = document.createElement("span");
                arrow.textContent = panel.open ? "▾" : "▸";
                arrow.setAttribute("aria-hidden", "true");
                panel.addEventListener("toggle", () => {
                    if (panel.open) state.folded.delete(entry.header);
                    else state.folded.add(entry.header);
                    arrow.textContent = panel.open ? "▾" : "▸";
                    header.style.borderBottomColor = panel.open ? "#ffffff18" : "transparent";
                });
                header.append(arrow, title, create_copy_button("Copy", () => entry.text));
                panel.append(header);
            }
            const content = document.createElement("pre");
            content.className = "multi-preview-content";
            content.textContent = entry.text;
            Object.assign(content.style, {
                margin: "0", padding: "12px 12px 16px", whiteSpace: "pre-wrap",
                overflowWrap: "anywhere", userSelect: "text", cursor: "text", font: "inherit", lineHeight: "1.45",
            });
            panel.append(content);
            panels.append(panel);
        }
    };
    const widget = node.addDOMWidget("preview_output", "multi-preview-panels", container, {
        serialize: false,
        getMinHeight: () => 100,
        getValue: () => state.value,
        setValue: value => {
            state.value = String(value ?? "");
            state.entries = [{ header: "", text: state.value }];
            render();
        },
    });
    widget.serialize = false;
    widget.setPreviewEntries = entries => {
        const current_headers = new Set(entries.map(entry => entry.header));
        for (const header of state.folded) {
            if (!current_headers.has(header)) state.folded.delete(header);
        }
        state.entries = entries;
        state.value = entries.map(entry => entry.header ? `${entry.header}\n\n${entry.text}` : entry.text).join("\n\n---\n\n");
        render();
    };
    render();
    return widget;
}

function create_preview_button(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    Object.assign(button.style, {
        flexShrink: "0", padding: "4px 10px", border: "1px solid #ffffff35", borderRadius: "4px",
        background: "var(--comfy-menu-bg, #333)", color: "inherit", cursor: "pointer", font: "14px sans-serif",
    });
    return button;
}

function create_copy_button(label, get_text) {
    const button = create_preview_button(label);
    button.title = label === "Copy" ? "Copy this input's content" : "Copy every preview, including headers";
    button.addEventListener("click", async event => {
        event.stopPropagation();
        const text = get_text();
        try {
            try {
                await navigator.clipboard.writeText(text);
            } catch {
                const fallback = document.createElement("textarea");
                fallback.value = text;
                Object.assign(fallback.style, { position: "fixed", left: "-10000px", top: "0" });
                document.body.append(fallback);
                try {
                    fallback.select();
                    if (!document.execCommand("copy")) throw new Error("Copy failed");
                } finally {
                    fallback.remove();
                }
            }
            button.textContent = "Copied";
        } catch {
            button.textContent = "Select text to copy";
        }
        setTimeout(() => { button.textContent = label; }, 1800);
    });
    return button;
}

function get_preview_entries(node, message) {
    const raw_entries = Array.isArray(message?.entries) ? message.entries :
        (message?.text?.[0] ?? "(no output)").split(/\n\n---\n\n(?=\[source_\d+(?: \||\]))/).map(block => {
            const boundary = block.indexOf("\n\n");
            return block.startsWith("[source_") && boundary >= 0
                ? { header: block.slice(0, boundary), text: block.slice(boundary + 2) }
                : { header: "", text: block };
        });
    if (!raw_entries.length) return [{ header: "", text: message?.text?.[0] ?? "(no inputs connected)" }];
    return raw_entries.map(entry => {
        const match = entry.header?.match(/^\[source_(\d+) \| (.*) \(#([^)]+)\) › slot (\d+) \| TYPE: (.*?) \]$/);
        if (!match) return { header: entry.header || "", text: entry.text };
        const [, index, title, node_id, output_slot, type] = match;
        const graph = node.graph ?? app.graph;
        const origin = graph?.getNodeById(node_id);
        const output = origin?.outputs?.[Number(output_slot)];
        const name = output?.label || output?.name || output?.type || "Input";
        const socket_type = output?.type || node.outputs?.[Number(index)]?.type || "*";
        return {
            header: `${index} - ${name} | ${title} (#${node_id}) | TYPE: ${type}`,
            text: entry.text,
            color: app.canvas.colourGetter.getConnectedColor(socket_type),
        };
    });
}


function update_dynamic_inputs(node) {
    // LiteGraph socket mutations can resize the node before this update finishes.
    const previous_size = [...node.size];
    try {
        let inputs = node.inputs || [];

        while (node.outputs && node.outputs.length < inputs.length) {
            node.addOutput(`source_${node.outputs.length}`, "*");
        }

        // PASS 1: Sync types and dynamically pull labels for ALL connected inputs
        for (let i = 0; i < inputs.length; i++) {
            let new_type = "*";
            const is_input_connected = inputs[i].link != null;

            if (is_input_connected && app.graph && app.graph.links) {
                const link = app.graph.links[inputs[i].link];
                if (link) {
                    new_type = link.type;

                    // NEW: Pull the label natively inside this loop so it works on load and on connect!
                    const origin_node = app.graph.getNodeById(link.origin_id);
                    if (origin_node) {
                        const output_name = origin_node.outputs?.[link.origin_slot]?.name;
                        if (output_name) {
                            inputs[i].label = `${output_name} (#${origin_node.id})`;
                        }
                    }
                }
            } else {
                // Instantly wipe the label if they unplug the wire
                delete inputs[i].label;
            }

            // Keep inputs open to replacement values of any type.
            inputs[i].type = "*";
            if (is_input_connected) {
                inputs[i].color_on = app.canvas.colourGetter.getConnectedColor(new_type);
            } else {
                delete inputs[i].color_on;
            }
            if (node.outputs[i]) node.outputs[i].type = new_type;

            if (node.outputs[i] && node.outputs[i].links) {
                for (const link_id of node.outputs[i].links) {
                    const link = app.graph.links[link_id];
                    if (link) link.type = new_type;
                }
            }

            if (!is_input_connected && node.outputs[i] && node.outputs[i].links) {
                const out_links = [...node.outputs[i].links];
                for (const link_id of out_links) {
                    const link = app.graph.links[link_id];
                    if (!link) continue;
                    const target_node = app.graph.getNodeById(link.target_id);
                    if (target_node) target_node.disconnectInput(link.target_slot);
                }
            }
        }

        // Strip fully unconnected pairs (backwards iteration)
        for (let i = inputs.length - 1; i >= 0; i--) {
            const input_connected = inputs[i].link != null;
            const output_connected = node.outputs && node.outputs[i] && node.outputs[i].links && node.outputs[i].links.length > 0;

            if (!input_connected && !output_connected) {
                node.removeInput(i);
                node.removeOutput(i);
            }
        }

        // Add exactly one empty pair at the end
        inputs = node.inputs || [];
        const next_idx = inputs.length;
        node.addInput(`source_${next_idx}`, "*");
        node.addOutput(`source_${next_idx}`, "*");

        inputs = node.inputs || [];
        const outputs = node.outputs || [];

        // Sync all core names (for python) and labels (for the UI) sequentially
        for (let i = 0; i < inputs.length; i++) {
            const expected_name = `source_${i}`;
            if (inputs[i].name !== expected_name) inputs[i].name = expected_name;
            if (outputs[i] && outputs[i].name !== expected_name) outputs[i].name = expected_name;

            if (inputs[i].label) {
                inputs[i].label = inputs[i].label.replace(/(?: \(\d+\))? (\(#[^)]+\))$/, ` (${i}) $1`);
                if (outputs[i]) outputs[i].label = inputs[i].label;
            } else {
                if (outputs[i]) delete outputs[i].label;
            }
        }

        while (node.outputs && node.outputs.length > node.inputs.length) {
            node.removeOutput(node.outputs.length - 1);
        }

        if (node.computeSize) {
            const new_size = node.computeSize();
            node.setSize([
                Math.max(previous_size[0], new_size[0]),
                Math.max(previous_size[1], new_size[1]),
            ]);
        }
        node.inputs = [...node.inputs];
    } catch (error) {
        console.error("[MultiPreviewAny] update_dynamic_inputs error:", error);
    }
}
// import { app }          from "../../scripts/app.js";
// import { ComfyWidgets } from "../../scripts/widgets.js";
//
// app.registerExtension({
//     name: "multipreviewastext.MultiPreviewAny",
//
//     async beforeRegisterNodeDef(nodeType, nodeData) {
//         if (nodeData.name !== "MultiPreviewAny") return;
//
//         const original_onNodeCreated = nodeType.prototype.onNodeCreated;
//         nodeType.prototype.onNodeCreated = function () {
//             original_onNodeCreated?.apply(this, arguments);
//
//             while (this.outputs && this.outputs.length > 0) {
//                 this.removeOutput(0);
//             }
//
//             this.resizable = true;
//             update_dynamic_inputs(this);
//
//             try {
//                 const {widget} = ComfyWidgets["STRING"](
//                     this,
//                     "preview_output",
//                     ["STRING", {multiline: true}],
//                     app
//                 );
//                 widget.inputEl.readOnly = true;
//                 widget.inputEl.style.overflow = "auto";
//                 widget.serialize = false;
//                 widget.value = "(no output)";
//             } catch (error) {
//                 console.error("[MultiPreviewAny] onNodeCreated error:", error);
//             }
//         };
//
//         const original_onConfigure = nodeType.prototype.onConfigure;
//         nodeType.prototype.onConfigure = function (info) {
//             original_onConfigure?.apply(this, arguments);
//             const text_widget = this.widgets?.find(w => w.name === "preview_output");
//             if (text_widget) {
//                 text_widget.value = "(no output)";
//                 if (text_widget.inputEl) {
//                     text_widget.inputEl.style.height = "60px";
//                 }
//             }
//             update_dynamic_inputs(this);
//         };
//
//         // Reads the text exactly as Python formatted it, then resizes the box
//         nodeType.prototype.onExecuted = function (message) {
//             try {
//                 const text_widget = this.widgets?.find(w => w.name === "preview_output");
//                 if (!text_widget) return;
//
//                 text_widget.value = message?.text?.[0] ?? "(no output)";
//
//                 requestAnimationFrame(() => {
//                     if (text_widget.inputEl) {
//                         text_widget.inputEl.style.height = "auto";
//                         const target_height = text_widget.inputEl.scrollHeight;
//                         const slot_height = 22;
//                         const overhead = 30 + (this.inputs?.length || 0) * slot_height + 12;
//                         this.setSize([this.size[0], overhead + target_height]);
//                         this.setDirtyCanvas(true, true);
//                     }
//                 });
//
//             } catch (error) {
//                 console.error("[MultiPreviewAny] onExecuted error:", error);
//             }
//         };
//
//         nodeType.prototype.onResize = function (size) {
//             const text_widget = this.widgets?.find(w => w.name === "preview_output");
//             if (!text_widget?.inputEl) return;
//             const slot_height = 22;
//             const overhead = 30 + (this.inputs?.length || 0) * slot_height + 12;
//             const available_height = Math.max(60, size[1] - overhead);
//             text_widget.inputEl.style.height = `${available_height}px`;
//         };
//
//         // YOUR ORIGINAL LOGIC: Renames the connection slots dynamically!
//         const original_onConnectionsChange = nodeType.prototype.onConnectionsChange;
//         nodeType.prototype.onConnectionsChange = function (
//             connection_type, slot_index, is_connected, link_info, input_info
//         ) {
//             if (this.ignore_connections_change) return;
//             this.ignore_connections_change = true;
//
//             try {
//                 original_onConnectionsChange?.apply(this, arguments);
//
//                 if (connection_type === 1) {
//                     if (is_connected && link_info) {
//                         const origin_node = app.graph.getNodeById(link_info.origin_id);
//                         if (origin_node) {
//                             const output_name = origin_node.outputs?.[link_info.origin_slot]?.name;
//                             if (output_name) {
//                                 this.inputs[slot_index].label = `${output_name} (#${origin_node.id})`;
//                             }
//                         }
//                     } else {
//                         if (this.inputs && this.inputs[slot_index]) {
//                             delete this.inputs[slot_index].label;
//                         }
//                     }
//                 }
//                 update_dynamic_inputs(this);
//             } finally {
//                 this.ignore_connections_change = false;
//             }
//         };
//     },
// });
//
// function update_dynamic_inputs(node) {
//     try {
//         let inputs = node.inputs || [];
//
//         while (node.outputs && node.outputs.length < inputs.length) {
//             node.addOutput(`source_${node.outputs.length}`, "*");
//         }
//
//         for (let i = 0; i < inputs.length; i++) {
//             let new_type = "*";
//             const is_input_connected = inputs[i].link != null;
//
//             if (is_input_connected && app.graph && app.graph.links) {
//                 const link = app.graph.links[inputs[i].link];
//                 if (link) new_type = link.type;
//             }
//
//             inputs[i].type = new_type;
//             if (node.outputs[i]) node.outputs[i].type = new_type;
//
//             if (node.outputs[i] && node.outputs[i].links) {
//                 for (const link_id of node.outputs[i].links) {
//                     const link = app.graph.links[link_id];
//                     if (link) link.type = new_type;
//                 }
//             }
//
//             if (!is_input_connected && node.outputs[i] && node.outputs[i].links) {
//                 const out_links = [...node.outputs[i].links];
//                 for (const link_id of out_links) {
//                     const link = app.graph.links[link_id];
//                     if (!link) continue;
//                     const target_node = app.graph.getNodeById(link.target_id);
//                     if (target_node) target_node.disconnectInput(link.target_slot);
//                 }
//             }
//         }
//
//         for (let i = inputs.length - 1; i >= 0; i--) {
//             const input_connected = inputs[i].link != null;
//             const output_connected = node.outputs && node.outputs[i] && node.outputs[i].links && node.outputs[i].links.length > 0;
//
//             if (!input_connected && !output_connected) {
//                 node.removeInput(i);
//                 node.removeOutput(i);
//             }
//         }
//
//         inputs = node.inputs || [];
//         const next_idx = inputs.length;
//         node.addInput(`source_${next_idx}`, "*");
//         node.addOutput(`source_${next_idx}`, "*");
//
//         inputs = node.inputs || [];
//         const outputs = node.outputs || [];
//
//         for (let i = 0; i < inputs.length; i++) {
//             const expected_name = `source_${i}`;
//             if (inputs[i].name !== expected_name) inputs[i].name = expected_name;
//             if (outputs[i] && outputs[i].name !== expected_name) outputs[i].name = expected_name;
//
//             if (inputs[i].label) {
//                 if (outputs[i]) outputs[i].label = inputs[i].label;
//             } else {
//                 if (outputs[i]) delete outputs[i].label;
//             }
//         }
//
//         while (node.outputs && node.outputs.length > node.inputs.length) {
//             node.removeOutput(node.outputs.length - 1);
//         }
//
//         if (node.computeSize) {
//             const new_size = node.computeSize();
//             node.setSize([Math.max(node.size[0], new_size[0]), new_size[1]]);
//         }
//
//     } catch (error) {
//         console.error("[MultiPreviewAny] update_dynamic_inputs error:", error);
//     }
// }
//
// // import { app } from "../../scripts/app.js";
// // import { ComfyWidgets } from "../../scripts/widgets.js";
// //
// // app.registerExtension({
// //     name: "multipreviewastext.MultiPreviewAny",
// //
// //     async beforeRegisterNodeDef(nodeType, nodeData) {
// //         if (nodeData.name !== "MultiPreviewAny") return;
// //
// //         console.log("[MultiPreviewAny] beforeRegisterNodeDef: registering node", nodeType);
// //
// //         const original_onNodeCreated = nodeType.prototype.onNodeCreated;
// //         nodeType.prototype.onNodeCreated = function () {
// //             original_onNodeCreated?.apply(this, arguments);
// //
// //             // Strip out the 100 placeholder outputs defined in Python's RETURN_TYPES
// //             while (this.outputs && this.outputs.length > 0) {
// //                 this.removeOutput(0);
// //             }
// //
// //             this.resizable = true;
// //
// //             // Generate the first output to match the default input
// //             update_dynamic_inputs(this);
// //
// //             try {
// //                 const { widget } = ComfyWidgets["STRING"](
// //                     this,
// //                     "preview_output",
// //                     ["STRING", { multiline: true }],
// //                     app
// //                 );
// //                 widget.inputEl.readOnly = true;
// //                 widget.inputEl.style.overflow = "auto";
// //
// //                 // Prevent the preview text from being saved to the workflow JSON
// //                 widget.serialize = false;
// //                 widget.value = "(no output)";
// //             } catch (error) {
// //                 console.error("[MultiPreviewAny] onNodeCreated: failed to add text widget", error);
// //             }
// //         };
// //
// //         const original_onConfigure = nodeType.prototype.onConfigure;
// //         nodeType.prototype.onConfigure = function (info) {
// //             original_onConfigure?.apply(this, arguments);
// //             try {
// //                 const text_widget = this.widgets?.find(w => w.name === "preview_output");
// //                 if (text_widget) {
// //                     // Wipe any existing saved data from old workflows
// //                     text_widget.value = "(no output)";
// //                     if (text_widget.inputEl) {
// //                         text_widget.inputEl.style.height = "60px";
// //                     }
// //                 }
// //
// //                 // Run a cleanup on load to strip any saved ghost slots
// //                 update_dynamic_inputs(this);
// //             } catch (error) {
// //                 console.error("[MultiPreviewAny] onConfigure: failed to reset widget", error);
// //             }
// //         };
// //
// //         nodeType.prototype.onExecuted = function (message) {
// //             try {
// //                 const text_widget = this.widgets?.find(w => w.name === "preview_output");
// //                 if (!text_widget) {
// //                     console.error("[MultiPreviewAny] onExecuted: preview_output widget not found", this);
// //                     return;
// //                 }
// //                 if (!message?.text?.[0]) {
// //                     console.error("[MultiPreviewAny] onExecuted: unexpected message format", message);
// //                 }
// //
// //                 let display_text = message?.text?.[0] ?? "(no output)";
// //
// //                 // Replace [source_N] headers with resolved node title + output name
// //                 display_text = display_text.replace(/\[source_(\d+)\](?:\r?\n)?/g, (match, index_str) => {
// //                     try {
// //                         const input_name = `source_${index_str}`;
// //                         const input = this.inputs?.find(inp => inp.name === input_name);
// //                         const link = input?.link != null ? app.graph.links[input.link] : null;
// //                         if (!link) return match;
// //
// //                         const origin_node = app.graph.getNodeById(link.origin_id);
// //                         if (!origin_node) return match;
// //
// //                         const output_name = origin_node.outputs?.[link.origin_slot]?.name ?? `slot ${link.origin_slot}`;
// //                         const node_title = origin_node.title ?? origin_node.type ?? "unknown";
// //                         const type_str = link.type ? String(link.type) : "*";
// //
// //                         return `[${input_name} | ${node_title} (#${origin_node.id}) › ${output_name} | TYPE: ${type_str} ]\n\n`;
// //                     } catch (resolve_error) {
// //                         console.error(`[MultiPreviewAny] onExecuted: could not resolve source_${index_str}`, resolve_error);
// //                         return match;
// //                     }
// //                 });
// //
// //                 text_widget.value = display_text;
// //
// //                 // Auto-resize to perfectly fit new content, triggering your safe onResize hook
// //                 requestAnimationFrame(() => {
// //                     if (text_widget.inputEl) {
// //                         // 1. Temporarily let browser expand the text box to measure it
// //                         text_widget.inputEl.style.height = "auto";
// //                         const target_height = text_widget.inputEl.scrollHeight;
// //
// //                         // 2. Use the exact overhead math from your working onResize logic
// //                         const slot_height = 22;
// //                         const overhead = 30 + (this.inputs?.length || 0) * slot_height + 12;
// //
// //                         // 3. Set the new node height. LiteGraph will automatically call onResize
// //                         // and correctly snap the DOM box into the new boundary!
// //                         this.setSize([this.size[0], overhead + target_height]);
// //                         this.setDirtyCanvas(true, true);
// //                     }
// //                 });
// //
// //             } catch (error) {
// //                 console.error("[MultiPreviewAny] onExecuted: failed to update widget", error);
// //             }
// //         };
// //
// //         nodeType.prototype.onResize = function (size) {
// //             try {
// //                 const text_widget = this.widgets?.find(w => w.name === "preview_output");
// //                 if (!text_widget?.inputEl) return;
// //                 const slot_height = 22;
// //                 const overhead = 30 + (this.inputs?.length || 0) * slot_height + 12;
// //                 const available_height = Math.max(60, size[1] - overhead);
// //                 text_widget.inputEl.style.height = `${available_height}px`;
// //             } catch (error) {
// //                 console.error("[MultiPreviewAny] onResize: failed", error);
// //             }
// //         };
// //
// //         const original_onConnectionsChange = nodeType.prototype.onConnectionsChange;
// //         nodeType.prototype.onConnectionsChange = function (
// //             connection_type,
// //             slot_index,
// //             is_connected,
// //             link_info,
// //             input_info
// //         ) {
// //             // Anti-crash guard
// //             if (this.ignore_connections_change) return;
// //             this.ignore_connections_change = true;
// //
// //             try {
// //                 original_onConnectionsChange?.apply(this, arguments);
// //
// //                 if (connection_type === 1) {
// //                     if (is_connected && link_info) {
// //                         const origin_node = app.graph.getNodeById(link_info.origin_id);
// //                         if (origin_node) {
// //                             const output_name = origin_node.outputs?.[link_info.origin_slot]?.name;
// //                             if (output_name) {
// //                                 this.inputs[slot_index].label = `${output_name} (#${origin_node.id})`;
// //                             }
// //                         }
// //                     } else {
// //                         if (this.inputs && this.inputs[slot_index]) {
// //                             delete this.inputs[slot_index].label;
// //                         }
// //                     }
// //                 }
// //
// //                 update_dynamic_inputs(this);
// //             } catch (error) {
// //                 console.error("[MultiPreviewAny] onConnectionsChange: failed", error);
// //             } finally {
// //                 this.ignore_connections_change = false;
// //             }
// //         };
// //     },
// // });
// //
// // function update_dynamic_inputs(node) {
// //     try {
// //         let inputs = node.inputs || [];
// //
// //         while (node.outputs && node.outputs.length < inputs.length) {
// //             node.addOutput(`source_${node.outputs.length}`, "*");
// //         }
// //
// //         // Safe loop update
// //         for (let i = 0; i < inputs.length; i++) {
// //             let new_type = "*";
// //             const is_input_connected = inputs[i].link != null;
// //
// //             if (is_input_connected && app.graph && app.graph.links) {
// //                 const link = app.graph.links[inputs[i].link];
// //                 if (link) new_type = link.type;
// //             }
// //
// //             inputs[i].type = new_type;
// //             if (node.outputs[i]) node.outputs[i].type = new_type;
// //
// //             if (node.outputs[i] && node.outputs[i].links) {
// //                 for (const link_id of node.outputs[i].links) {
// //                     const link = app.graph.links[link_id];
// //                     if (link) link.type = new_type;
// //                 }
// //             }
// //
// //             if (!is_input_connected && node.outputs[i] && node.outputs[i].links) {
// //                 const out_links = [...node.outputs[i].links];
// //                 for (const link_id of out_links) {
// //                     const link = app.graph.links[link_id];
// //                     if (!link) continue;
// //                     const target_node = app.graph.getNodeById(link.target_id);
// //                     if (target_node) target_node.disconnectInput(link.target_slot);
// //                 }
// //             }
// //         }
// //
// //         // Strip fully unconnected pairs (backwards iteration)
// //         for (let i = inputs.length - 1; i >= 0; i--) {
// //             const input_connected = inputs[i].link != null;
// //             const output_connected = node.outputs && node.outputs[i] && node.outputs[i].links && node.outputs[i].links.length > 0;
// //
// //             if (!input_connected && !output_connected) {
// //                 node.removeInput(i);
// //                 node.removeOutput(i);
// //             }
// //         }
// //
// //         // Add exactly one empty pair at the end
// //         inputs = node.inputs || [];
// //         const next_idx = inputs.length;
// //         node.addInput(`source_${next_idx}`, "*");
// //         node.addOutput(`source_${next_idx}`, "*");
// //
// //         inputs = node.inputs || [];
// //         const outputs = node.outputs || [];
// //
// //         // Sync all names and labels sequentially
// //         for (let i = 0; i < inputs.length; i++) {
// //             const expected_name = `source_${i}`;
// //             if (inputs[i].name !== expected_name) inputs[i].name = expected_name;
// //             if (outputs[i] && outputs[i].name !== expected_name) outputs[i].name = expected_name;
// //
// //             if (inputs[i].label) {
// //                 if (outputs[i]) outputs[i].label = inputs[i].label;
// //             } else {
// //                 if (outputs[i]) delete outputs[i].label;
// //             }
// //         }
// //
// //         // Cleanup excess outputs
// //         while (node.outputs && node.outputs.length > node.inputs.length) {
// //             node.removeOutput(node.outputs.length - 1);
// //         }
// //
// //         // Update bounds
// //         if (node.computeSize) {
// //             const new_size = node.computeSize();
// //             node.setSize([Math.max(node.size[0], new_size[0]), new_size[1]]);
// //         }
// //
// //     } catch (error) {
// //         console.error("[MultiPreviewAny] update_dynamic_inputs: failed", error);
// //     }
// // }
