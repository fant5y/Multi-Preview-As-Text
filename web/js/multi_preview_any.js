import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

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
            update_dynamic_inputs(this);

            try {
                const { widget } = ComfyWidgets["STRING"](
                    this,
                    "preview_output",
                    ["STRING", { multiline: true }],
                    app
                );
                widget.inputEl.readOnly = true;
                widget.inputEl.style.overflow = "auto";
                widget.serialize = false;
                widget.value = "(no output)";
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
                if (text_widget.inputEl) {
                    text_widget.inputEl.style.height = "60px";
                }
            }
            // This now guarantees labels are fixed immediately on load!
            update_dynamic_inputs(this);
        };

        nodeType.prototype.onExecuted = function (message) {
            try {
                const text_widget = this.widgets?.find(w => w.name === "preview_output");
                if (!text_widget) return;

                text_widget.value = message?.text?.[0] ?? "(no output)";

                requestAnimationFrame(() => {
                    if (text_widget.inputEl) {
                        text_widget.inputEl.style.height = "auto";
                        const target_height = text_widget.inputEl.scrollHeight;
                        const slot_height = 22;
                        const overhead = 30 + (this.inputs?.length || 0) * slot_height + 12;
                        this.setSize([this.size[0], overhead + target_height]);
                        this.setDirtyCanvas(true, true);
                    }
                });

            } catch (error) {
                console.error("[MultiPreviewAny] onExecuted error:", error);
            }
        };

        nodeType.prototype.onResize = function (size) {
            const text_widget = this.widgets?.find(w => w.name === "preview_output");
            if (!text_widget?.inputEl) return;
            const slot_height = 22;
            const overhead = 30 + (this.inputs?.length || 0) * slot_height + 12;
            const available_height = Math.max(60, size[1] - overhead);
            text_widget.inputEl.style.height = `${available_height}px`;
        };

        const original_onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (
            connection_type, slot_index, is_connected, link_info, input_info
        ) {
            if (this.ignore_connections_change) return;
            this.ignore_connections_change = true;

            try {
                original_onConnectionsChange?.apply(this, arguments);
                // We let update_dynamic_inputs handle ALL the naming now!
                update_dynamic_inputs(this);
            } finally {
                this.ignore_connections_change = false;
            }
        };
    },
});

function update_dynamic_inputs(node) {
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

            inputs[i].type = new_type;
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
            node.setSize([Math.max(node.size[0], new_size[0]), new_size[1]]);
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
