import { app } from "../../scripts/app.js";

// Must stay in sync with ASPECT_RATIOS in resolution_selector_extended.py
const ASPECT_RATIOS = {
    // --- Portrait Formats ---
    "9:32 (Super Ultrawide)": [9, 32],
    "1:3 (Tall Panorama)": [1, 3],
    "9:24 (Full-Frame)": [9,24],
    "1:2.39 (35mm Anamorphic)": [1, 2.39],
    "9:21 (Ultrawide Portrait)": [9, 21],
    "9:19.5 (Smartphone)":[9, 19.5],
    "1:1.91 (Social Feed)": [1, 1.91],
    "1:1.85 (American Widescreen)": [1, 1.85],
    "9:16 (Tall Portrait)": [9, 16],
    "10:16 (Golden Ratio)": [10, 16],
    "5:8 (Golden Ratio)": [5, 8],
    "2:3 (Medium Portrait)": [2, 3],
    "5:7 (International Portrait)": [5, 7],
    "3:4 (Standard Portrait)": [3, 4],
    "4:5 (Canvas Portrait)": [4, 5],
    // --- Square Formats ---
    "1:1 (Square)": [1, 1],
    // --- Landscape Formats ---
    "5:4 (Canvas Format)": [5, 4],
    "4:3 (Standard Format)": [4, 3],
    "7:5 (International Print)": [7, 5],
    "3:2 (Medium Landscape)": [3, 2],
    "8:5 (Golden Ratio)": [8, 5],
    "16:10 (Golden Ratio)": [16, 10],
    "16:9 (Widescreen)": [16, 9],
    "1.85:1 (American Widescreen)": [1.85, 1],
    "1.91:1 (Social Feed)": [1.91, 1],
    "19.5:9 (Smartphone)": [19.5, 9],
    "21:9 (Ultrawide)": [21, 9],
    "2.39:1 (35mm Anamorphic)": [2.39, 1],
    "24:9 (Full-Frame)": [24, 9],
    "3:1 (Panorama)": [3, 1],
    "32:9 (Super Ultrawide)": [32, 9]
};

const PIXELS_PER_MEGAPIXEL = 1024 * 1024;
const LOG_PREFIX = "[ResolutionSelectorExtended]";

const CUSTOM_PRESET_LABEL = "Custom (use megapixels slider)";

// Must stay in sync with RESOLUTION_PRESETS in resolution_selector_extended.py
// Values are reference (width, height) pairs used only to derive a target pixel
// count - the actual output shape always comes from aspect_ratio.
const RESOLUTION_PRESETS = {
    [CUSTOM_PRESET_LABEL]: null,
    "SD (480p)": [640, 480],
    "HD (720p)": [1280, 720],
    "FHD (1080p)": [1920, 1080],
    "QHD (1440p)": [2560, 1440],
    "4K (2160p)": [3840, 2160],
    "8K (4320p)": [7680, 4320],
};

function roundToMultiple(value, multiple) {
    const rounded = Math.round(value / multiple) * multiple;
    return Math.max(multiple, rounded);
}

function calculateResolution(presetLabel, aspectRatioLabel, megapixels, multiple) {
    const ratio = ASPECT_RATIOS[aspectRatioLabel];
    if (!ratio) {
        console.warn(`${LOG_PREFIX} unknown aspect_ratio label:`, aspectRatioLabel);
        return null;
    }
    const [ratioWidth, ratioHeight] = ratio;

    const presetReference = RESOLUTION_PRESETS[presetLabel];
    let effectiveMegapixels = megapixels;
    if (presetReference) {
        const [referenceWidth, referenceHeight] = presetReference;
        effectiveMegapixels = (referenceWidth * referenceHeight) / PIXELS_PER_MEGAPIXEL;
    }

    const targetPixelCount = effectiveMegapixels * PIXELS_PER_MEGAPIXEL;
    const rawHeight = Math.sqrt((targetPixelCount * ratioHeight) / ratioWidth);
    const rawWidth = (rawHeight * ratioWidth) / ratioHeight;

    // multiple always applies last, regardless of whether the pixel target
    // came from the megapixels slider or a preset's reference resolution.
    return {
        width: roundToMultiple(rawWidth, multiple),
        height: roundToMultiple(rawHeight, multiple),
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

            const node = this;

            const findWidget = (name) => {
                const widget = node.widgets?.find((w) => w.name === name);
                if (!widget) {
                    console.error(
                        `${LOG_PREFIX} widget "${name}" not found. Available widgets:`,
                        node.widgets?.map((w) => w.name)
                    );
                }
                return widget;
            };

            const presetWidget = findWidget("preset");
            const aspectRatioWidget = findWidget("aspect_ratio");
            const megapixelsWidget = findWidget("megapixels");
            const multipleWidget = findWidget("multiple");

            const previewElement = document.createElement("div");
            previewElement.style.textAlign = "center";
            previewElement.style.color = "var(--descrip-text)";
            previewElement.style.fontSize = "12px";
            previewElement.textContent = "";

            const previewWidget = node.addDOMWidget(
                "resolution_preview",
                "preview",
                previewElement,
                { serialize: false }
            );

            if (!presetWidget || !aspectRatioWidget || !megapixelsWidget || !multipleWidget) {
                previewElement.textContent = "(widget lookup failed, see console)";
                return;
            }

            const updatePreview = () => {
                const result = calculateResolution(
                    presetWidget.value,
                    aspectRatioWidget.value,
                    megapixelsWidget.value,
                    multipleWidget.value
                );
                console.log(`${LOG_PREFIX} update`, {
                    preset: presetWidget.value,
                    aspect_ratio: aspectRatioWidget.value,
                    megapixels: megapixelsWidget.value,
                    multiple: multipleWidget.value,
                    result,
                });
                previewElement.textContent = result ? `${result.width} x ${result.height}` : "(calc failed)";
            };

            for (const widget of [presetWidget, aspectRatioWidget, megapixelsWidget, multipleWidget]) {
                const originalCallback = widget.callback;
                widget.callback = function (...args) {
                    originalCallback?.apply(this, args);
                    updatePreview();
                };
            }

            updatePreview();
        };
    },
});
