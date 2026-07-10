"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisionPlugin = void 0;
const base_1 = require("./base");
class AnalyzeImageTool {
    name = 'analyze_image';
    description = 'Analyze an image using vision-capable models (GPT-4V, LLaVA, etc.)';
    parameters = {
        image: { type: 'string', description: 'Base64 image data or image URL', required: true },
        prompt: { type: 'string', description: 'What to analyze about the image (default: "Describe this image")' },
        model: { type: 'string', description: 'Vision model to use' },
    };
    async execute(params) {
        const image = params.image;
        const prompt = params.prompt || 'Describe this image in detail';
        return {
            success: true,
            output: {
                format: 'analysis',
                note: 'Vision analysis requires a vision-capable model (LLaVA, GPT-4V, Qwen-VL, etc.)',
                prompt,
                imageProvided: !!image,
            },
        };
    }
}
class OCRExtractTool {
    name = 'ocr_extract';
    description = 'Extract text from images using OCR';
    parameters = {
        image: { type: 'string', description: 'Base64 image data or image path', required: true },
        language: { type: 'string', description: 'Language for OCR (default: eng)' },
    };
    async execute(params) {
        const image = params.image;
        return {
            success: true,
            output: {
                format: 'text',
                note: 'OCR requires Tesseract or similar OCR engine configured',
                imageProvided: !!image,
            },
        };
    }
}
class DescribeChartTool {
    name = 'describe_chart';
    description = 'Extract and describe data from charts, graphs, and diagrams';
    parameters = {
        image: { type: 'string', description: 'Base64 image data of the chart', required: true },
        format: { type: 'string', description: 'Output format: text, json, or markdown (default: text)' },
    };
    async execute(params) {
        return {
            success: true,
            output: {
                format: 'chart_analysis',
                note: 'Chart analysis requires a vision-capable model',
            },
        };
    }
}
class VisionPlugin extends base_1.Plugin {
    manifest = {
        id: 'vision',
        name: 'Vision',
        version: '1.0.0',
        description: 'Analyze images, extract text via OCR, and interpret charts using vision-capable models',
        author: 'ModelVerse',
        icon: 'eye',
        category: 'vision',
        enabled: false,
        settings: [
            { key: 'provider', label: 'Vision Provider', type: 'select', default: 'llava', options: [
                    { label: 'LLaVA (Local)', value: 'llava' },
                    { label: 'GPT-4V (OpenAI)', value: 'gpt4v' },
                    { label: 'Qwen-VL', value: 'qwen-vl' },
                ] },
            { key: 'ocr_engine', label: 'OCR Engine', type: 'select', default: 'tesseract', options: [
                    { label: 'Tesseract', value: 'tesseract' },
                    { label: 'EasyOCR', value: 'easyocr' },
                ] },
        ],
    };
    async activate(ctx) {
        this.ctx = ctx;
        this.registerTool(new AnalyzeImageTool());
        this.registerTool(new OCRExtractTool());
        this.registerTool(new DescribeChartTool());
        ctx.log('Vision plugin activated');
    }
    async deactivate() {
        this.tools = [];
    }
}
exports.VisionPlugin = VisionPlugin;
