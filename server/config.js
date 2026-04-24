require('dotenv').config();

module.exports = {
    LLM: {
        API_KEY: process.env.LLM_API_KEY,
        BASE_URL: process.env.LLM_BASE_URL,
        MODEL_NAME: "gpt-5.4-high"  // ✅ 你指定
    },
    IMAGE_API: {
        KEY: process.env.IMAGE_API_KEY,
        URL: `${process.env.LLM_BASE_URL}/images/generations`,
        MODEL: "doubao-seedream-4-0"  // ✅ 你指定
    },
    VIDEO_API: {
        KEY: process.env.VIDEO_API_KEY,
        BASE_URL: `${process.env.LLM_BASE_URL}/videos`,
        MODEL: "grok-imagine-video"  // ✅ 你指定
    },
    PORT: process.env.PORT || 3001
};