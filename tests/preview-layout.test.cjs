const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const sourcePath = process.env.PREVIEW_JS_PATH || path.resolve(__dirname, '../web/js/multi_preview_any.js');

const frameQueues = new WeakMap();

class TestElement {
    constructor() {
        this.style = {};
        this.children = [];
        this.dataset = {};
        this.scrollHeight = 100;
        this.clientHeight = 100;
    }
    append(...elements) { this.children.push(...elements); }
    replaceChildren(...elements) { this.children = elements; }
    addEventListener() {}
    setAttribute() {}
    getContext() { return { measureText(text) { return { width: text.length * 8 }; } }; }
}

async function createNode() {
    let extension;
    const frames = [];
    const graph = {
        links: {},
        getNodeById(id) {
            return String(id) === '233' ? { id: 233, outputs: [{ name: 'IMAGE' }, { name: 'MASK' }] } : null;
        },
    };
    class PreviewNode {
        constructor() {
            this.size = [220, 2020];
            this.inputs = [{ name: 'source_0', type: '*', link: null }];
            this.outputs = Array.from({ length: 100 }, (_, index) => ({ name: `source_${index}`, type: '*', links: null }));
            this.widgets = [];
        }
        computeSize() { return [220, 20 * this.inputs.length + (this.widgets.length ? 120 : 20)]; }
        setSize(size) { this.size = [...size]; this.onResize?.(size); }
        addInput(name, type) { this.inputs.push({ name, type, link: null }); this.setSize(this.computeSize()); }
        addOutput(name, type) { this.outputs.push({ name, type, links: null }); this.setSize(this.computeSize()); }
        removeInput(index) { this.inputs.splice(index, 1); this.setSize(this.computeSize()); }
        removeOutput(index) {
            const removed = this.outputs[index];
            const remainingLinks = this.outputs.slice(index + 1).map(output => [...(output.links || [])]);
            for (const id of removed.links || []) delete graph.links[id];
            this.outputs.splice(index, 1);
            for (let offset = 0; offset < remainingLinks.length; offset++) {
                for (const id of remainingLinks[offset]) graph.links[id].origin_slot = index + offset;
            }
        }
        setDirtyCanvas() {}
        addDOMWidget(name, type, element, options) {
            const widget = { name, type, element, options };
            Object.defineProperty(widget, 'value', { get: options.getValue, set: options.setValue });
            this.widgets.push(widget);
            return widget;
        }
    }
    const canvas = {
        linkConnector: { isConnecting: false },
        colourGetter: {
            getConnectedColor(type) { return { IMAGE: '#64b5f6', MASK: '#81c784' }[type] || '#7F7'; },
        },
    };
    const app = { graph, canvas, registerExtension(value) { extension = value; } };
    const source = fs.readFileSync(sourcePath, 'utf8').replace(/^import .*;\r?\n/gm, '');
    vm.runInNewContext(source, {
        app, console,
        document: { createElement() { return new TestElement(); } },
        getComputedStyle() { return { font: "13px monospace" }; },
        requestAnimationFrame(fn) { frames.push(fn); },
    });
    await extension.beforeRegisterNodeDef(PreviewNode, { name: 'MultiPreviewAny' });
    const node = new PreviewNode();
    node.onNodeCreated();
    frameQueues.set(node, frames);
    return {
        node, graph, canvas,
        flushFrame() { for (const callback of frames.splice(0)) callback(); },
        flush() { while (frames.length) frames.shift()(); },
    };
}

function connect(node, graph, index = 0, originSlot = 0) {
    graph.links[index + 1] = { origin_id: 233, origin_slot: originSlot, type: originSlot ? 'MASK' : 'IMAGE' };
    node.inputs[index].link = index + 1;
    node.onConnectionsChange(1, index, true, graph.links[index + 1], node.inputs[index]);
    const frames = frameQueues.get(node);
    while (frames.length) frames.shift()();
}

test('new preview reserves space for its text widget', async () => {
    const { node } = await createNode();
    assert.ok(node.size[1] >= node.computeSize()[1]);
    assert.ok(node.size[1] < 400, 'creation must discard the temporary height for 100 schema outputs');
});

test('connecting and disconnecting preserve dimensions and preview text', async () => {
    const { node, graph, flush } = await createNode();
    node.setSize([800, 600]);
    node.widgets[0].value = 'Existing result';
    connect(node, graph);
    assert.deepEqual(node.size, [800, 600]);
    assert.equal(node.widgets[0].value, 'Existing result');
    assert.equal(node.inputs.length, 2);
    assert.equal(node.outputs[0].type, 'IMAGE');
    node.inputs[0].link = null;
    node.onConnectionsChange(1, 0, false);
    flush();
    assert.deepEqual(node.size, [800, 600]);
    assert.equal(node.inputs.length, 1);
    assert.equal(node.outputs.length, 1);
});

test('loading a workflow preserves its saved dimensions', async () => {
    const { node } = await createNode();
    node.setSize([900, 700]);
    node.onConfigure({ size: [900, 700] });
    assert.deepEqual(node.size, [900, 700]);
});

test('displayed headers use output names, local input indices, and node IDs beside titles', async () => {
    const { node, graph, flush } = await createNode();
    connect(node, graph);
    connect(node, graph, 1, 1);
    node.onExecuted({ text: ['[source_0 | Load Image (#233) › slot 0 | TYPE: Tensor ]\n\nimage data\n\n---\n\n[source_1 | Load Image (#233) › slot 1 | TYPE: Tensor ]\n\nmask data'] });
    flush();
    assert.equal(node.widgets[0].value, '0 - IMAGE | Load Image (#233) | TYPE: Tensor\n\nimage data\n\n---\n\n1 - MASK | Load Image (#233) | TYPE: Tensor\n\nmask data');
});

test('execution preserves a manually enlarged preview', async () => {
    const { node, flush } = await createNode();
    node.setSize([800, 600]);
    node.onExecuted({ text: ['short output'] });
    flush();
    assert.deepEqual(node.size, [800, 600]);
});

test('long output grows by the overflowing text height', async () => {
    const { node, flush } = await createNode();
    node.setSize([800, 600]);
    node.widgets[0].element.clientHeight = 450;
    node.widgets[0].element.scrollHeight = 750;
    node.onExecuted({ text: ['long output'] });
    flush();
    assert.equal(node.size[1], 900);
});

test('execution widens a compact preview before measuring wrapped text height', async () => {
    const { node, flush } = await createNode();
    const element = node.widgets[0].element;
    element.clientHeight = 100;
    Object.defineProperty(element, 'scrollHeight', {
        get() { return node.size[0] < 560 ? 1000 : 100; },
    });
    node.onExecuted({ text: ['A'.repeat(60)] });
    flush();
    assert.equal(node.size[0], 560);
    assert.ok(node.size[1] < 400, 'height must be measured after the wider layout');
});

test('exceptionally long lines do not create an excessively wide preview', async () => {
    const { node, flush } = await createNode();
    node.onExecuted({ text: ['A'.repeat(10000)] });
    flush();
    assert.equal(node.size[0], 1000);
});
test('moving a connection retains the destination slot until the drag finishes', async () => {
    const { node, graph, canvas, flushFrame, flush } = await createNode();
    connect(node, graph);
    connect(node, graph, 1);
    const destination = node.inputs[2];
    canvas.linkConnector.isConnecting = true;
    node.inputs[0].link = null;
    node.onConnectionsChange(1, 0, false);
    assert.equal(node.inputs[2], destination, 'disconnect must not remove or renumber the destination');
    flushFrame();
    assert.equal(node.inputs[2], destination, 'cleanup must wait throughout the drag');
    graph.links[10] = { origin_id: 233, origin_slot: 0, type: 'IMAGE' };
    destination.link = 10;
    node.onConnectionsChange(1, 2, true, graph.links[10], destination);
    canvas.linkConnector.isConnecting = false;
    flush();
    assert.ok(node.inputs.includes(destination));
    assert.equal(destination.link, 10);
    assert.equal(node.inputs.length, 3);
});

test('replacing a connection keeps its passthrough wire during the transient disconnect', async () => {
    const { node, graph, flush } = await createNode();
    connect(node, graph);
    let disconnected = false;
    const originalGetNode = graph.getNodeById;
    graph.getNodeById = id => id === 900
        ? { disconnectInput() { disconnected = true; } }
        : originalGetNode(id);
    graph.links[20] = { target_id: 900, target_slot: 0, type: 'IMAGE' };
    node.outputs[0].links = [20];
    node.inputs[0].link = null;
    node.onConnectionsChange(1, 0, false);
    assert.equal(disconnected, false);
    graph.links[10] = { origin_id: 233, origin_slot: 0, type: 'IMAGE' };
    node.inputs[0].link = 10;
    node.onConnectionsChange(1, 0, true, graph.links[10], node.inputs[0]);
    flush();
    assert.equal(disconnected, false);
    assert.equal(node.inputs[0].link, 10);
    assert.deepEqual(node.outputs[0].links, [20]);
});
test('connected preview inputs accept replacement types while outputs follow the new value', async () => {
    const { node, graph, flush } = await createNode();
    connect(node, graph);
    assert.equal(node.inputs[0].type, '*', 'a connected IMAGE input must still accept another type');
    assert.equal(node.outputs[0].type, 'IMAGE');
    connect(node, graph, 0, 1);
    assert.equal(node.inputs[0].type, '*');
    assert.equal(node.outputs[0].type, 'MASK');
    assert.equal(node.inputs[0].label, 'MASK (0) (#233)');
    assert.equal(node.outputs[0].label, 'MASK (0) (#233)');
    node.onConfigure({ size: node.size });
    flush();
    assert.equal(node.inputs[0].type, '*', 'loading a workflow must also leave input types open');
    assert.equal(node.outputs[0].type, 'MASK');
});
test('wildcard inputs display the connected type color and clear it after disconnect', async () => {
    const { node, graph, flush } = await createNode();
    connect(node, graph);
    const input = node.inputs[0];
    assert.equal(input.type, '*');
    assert.equal(input.color_on, '#64b5f6');
    connect(node, graph, 0, 1);
    assert.equal(input.type, '*');
    assert.equal(input.color_on, '#81c784');
    // Keep the disconnected object available to check that stale styling is cleared.
    input.link = null;
    node.onConnectionsChange(1, 0, false);
    flush();
    assert.equal(input.color_on, undefined);
    assert.equal(node.inputs[0].color_on, undefined);
});
for (const [from, to] of [[0, 1], [1, 0], [0, 2], [1, 2]]) {
    test(`moving input ${from} to input ${to} preserves source connections and their output wires`, async () => {
        const { node, graph, canvas, flush } = await createNode();
        let nextId = 100;
        const sources = new Map();
        const disconnect = index => {
            const id = node.inputs[index].link;
            node.inputs[index].link = null;
            if (id != null) {
                const link = graph.links[id];
                delete graph.links[id];
                node.onConnectionsChange(1, index, false, link, node.inputs[index]);
            }
        };
        for (const [id, type] of [[233, 'IMAGE'], [234, 'AUDIO']]) {
            const sourceNode = {
                id,
                outputs: [{ name: type, type }],
                connect(outputIndex, target, inputIndex) {
                    if (target.onConnectInput?.(inputIndex, type, this.outputs[outputIndex], this, outputIndex) === false) return null;
                    disconnect(inputIndex);
                    const link = { id: nextId++, origin_id: id, origin_slot: outputIndex, target_slot: inputIndex, type };
                    graph.links[link.id] = link;
                    target.inputs[inputIndex].link = link.id;
                    target.onConnectionsChange(1, inputIndex, true, link, target.inputs[inputIndex]);
                    return link;
                },
            };
            sources.set(id, sourceNode);
        }
        graph.getNodeById = id => sources.get(Number(id));
        sources.get(233).connect(0, node, 0);
        flush();
        sources.get(234).connect(0, node, 1);
        flush();
        for (const [slot, id] of [[0, 200], [1, 201]]) {
            graph.links[id] = { id, origin_slot: slot, target_id: 900 + slot, target_slot: 0 };
            node.outputs[slot].links = [id];
        }
        // Native output links are a view of the graph at the slot's current index.
        for (const output of node.outputs) {
            Object.defineProperty(output, 'links', {
                get() {
                    const slot = node.outputs.indexOf(this);
                    const ids = Object.values(graph.links)
                        .filter(link => link.id >= 200 && link.origin_slot === slot)
                        .map(link => link.id);
                    return ids.length ? ids : null;
                },
            });
        }
        const movingSource = sources.get(from === 0 ? 233 : 234);
        canvas.linkConnector.renderLinks = [{
            toType: 'input', inputNode: node, inputSlot: node.inputs[from],
            outputNode: movingSource, outputIndex: 0,
        }];
        canvas.linkConnector.isConnecting = true;
        disconnect(from);
        movingSource.connect(0, node, to);
        canvas.linkConnector.isConnecting = false;
        canvas.linkConnector.renderLinks = [];
        flush();
        const expectedSources = from === 1 && to === 2 ? [233, 234] : [234, 233];
        for (let slot = 0; slot < 2; slot++) {
            assert.equal(graph.links[node.inputs[slot].link].origin_id, expectedSources[slot]);
            const expectedWire = expectedSources[slot] === 233 ? 200 : 201;
            assert.deepEqual(node.outputs[slot].links, [expectedWire], 'output wire must follow its source');
            assert.equal(graph.links[expectedWire].origin_slot, slot, 'wire must reference its new output slot');
        }
        assert.equal(node.inputs.length, 3);
        assert.equal(node.outputs[0].type, expectedSources[0] === 233 ? 'IMAGE' : 'AUDIO');
        assert.equal(node.outputs[1].type, expectedSources[1] === 233 ? 'IMAGE' : 'AUDIO');
        assert.equal(node.inputs[0].type, '*');
        assert.equal(node.inputs[1].type, '*');
    });
}