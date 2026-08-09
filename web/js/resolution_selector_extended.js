import { app } from "../../scripts/app.js";

// Must stay in sync with ASPECT_RATIOS in resolution_selector_extended.py
const ASPECT_RATIOS = {
    "1:1 (Square)": [1, 1],
    "3:2 (Photo Format)": [3, 2],
    "4:3 (Standard Format)": [4, 3],
    "5:4 (Canvas Format)": [5, 4],
    "16:9 (Widescreen)": [16, 9],
    "21:9 (Ultrawide)": [21, 9],
    "3:1 (Panorama)": [3, 1],
    "2:3 (Medium Portrait)": [2, 3],
    "3:4 (Standard Portrait)": [3, 4],
    "4:5 (Canvas Portrait)": [4, 5],
    "9:16 (Tall Portrait)": [9, 16],
    "1:3 (Tall Panorama)": [1, 3]
};

const PIXELS_PER_MEGAPIXEL = 1024 * 1024;

function roundToMultiple(value, multiple) {
    const rounded = Math.round(value / multiple) * multiple;
    return Math.max(multiple, rounded);
}

function calculateResolution(aspectRatioLabel, megapixels, multiple) {
    const ratio = ASPECT_RATIOS[aspectRatioLabel];
    if (!ratio) {
        return null;
    }
    const [ratioWidth, ratioHeight] = ratio;
    const targetPixelCount = megapixels * PIXELS_PER_MEGAPIXEL;

    const rawHeight = Math.sqrt((targetPixelCount * ratioHeight) / ratioWidth);
    const rawWidth = (rawHeight * ratioWidth) / ratioHeight;

    return {
        width: roundToMultiple(rawWidth, multiple),
        height: roundToMultiple(rawHeight, multiple)
    };
}

app.registerExtension({
    name: "fant5y.ResolutionSelectorExtended.livePreview",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "ResolutionSelectorExtended") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);

            const aspectRatioWidget = this.widgets.find((w) => w.name === "aspect_ratio");
            const megapixelsWidget = this.widgets.find((w) => w.name === "megapixels");
            const multipleWidget = this.widgets.find((w) => w.name === "multiple");

            const previewWidget = this.addWidget(
                "text",
                "resolution_preview",
                "",
                () => {
                },
                {serialize: false}
            );
            previewWidget.disabled = true;

            const updatePreview = () => {
                const result = calculateResolution(
                    aspectRatioWidget.value,
                    megapixelsWidget.value,
                    multipleWidget.value
                );
                previewWidget.value = result ? `${result.width} x ${result.height}` : "";
                this.setDirtyCanvas(true, true);
            };

            for (const widget of [aspectRatioWidget, megapixelsWidget, multipleWidget]) {
                const originalCallback = widget.callback;
                widget.callback = function (...args) {
                    originalCallback?.apply(this, args);
                    updatePreview();
                };
            }

            updatePreview();
        };
    }
});
