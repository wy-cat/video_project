const axios = require('axios');
const http = require('http');
const https = require('https');
const { IMAGE_API } = require('../config');

// ==============================
// 配置 axios HTTP Agent 来管理连接池
// 解决连接不释放导致的"连接失败"问题
// ==============================
const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000
});

const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000
});

// 创建配置好的 axios 实例
const axiosInstance = axios.create({
    httpAgent: httpAgent,
    httpsAgent: httpsAgent,
    timeout: 180000
});

// ==============================
// 生成单张图片
// ==============================
exports.generateImageFromPrompt = async (prompt) => {
    try {
        if (!prompt || !String(prompt).trim()) {
            throw new Error('图片提示词不能为空');
        }

        const res = await axiosInstance.post(IMAGE_API.URL, {
            model: IMAGE_API.MODEL,
            prompt,
            size: '1024x1024',
            response_format: 'url'
        }, {
            headers: { Authorization: `Bearer ${IMAGE_API.KEY}` }
        });

        const imageUrl = res.data?.data?.[0]?.url;
        if (!imageUrl) {
            throw new Error('API响应中缺少图片URL');
        }

        return { imageUrl };
    } catch (error) {
        console.error('❌ 单张图片生成失败:', error.message);
        throw error;
    }
};

// ==============================
// 批量生成图片（并行，保持顺序）
// 功能：调用图片生成API，为每个提示词生成一张图片
// 输入：imagePromptList（图片提示词数组）, options（选项对象）
// 输出：imageUrls（图片对象数组，包含imageUrl字段）
// 说明：支持重试机制，最多重试3次；并行执行但返回结果顺序与输入一致；支持每张图生成后回调，便于增量缓存
// options.onItemSuccess: 每张图片成功后的回调函数 (item, pendingIndex) => void
// ==============================
exports.generateImages = async (imagePromptList, options = {}) => {
    try {
        console.log('\n🎨 开始批量生成图片');
        
        if (!imagePromptList || imagePromptList.length === 0) {
            throw new Error('图片提示词列表为空');
        }
        
        console.log('📊 提示词数量:', imagePromptList.length);
        console.log('');

        const imageUrls = new Array(imagePromptList.length);
        const maxRetries = 3; // 最多重试3次
        const retryDelay = 2000; // 重试延迟2秒
        const onItemSuccess = typeof options.onItemSuccess === 'function' ? options.onItemSuccess : null;

        const generateSingleImage = async (item, idx) => {
            console.log(`\n🖼️ [图片 ${idx + 1}/${imagePromptList.length}] 开始生成...`);
            console.log('📝 提示词:', item.substring(0, 100) + '...');
            console.log('');

            let retryCount = 0;

            while (retryCount < maxRetries) {
                try {
                    console.log(`🔄 [图片 ${idx + 1}/${imagePromptList.length}] [尝试 ${retryCount + 1}/${maxRetries}] 调用图片API...`);

                    const res = await axiosInstance.post(IMAGE_API.URL, {
                        model: IMAGE_API.MODEL,
                        prompt: item,
                        size: "1024x1024",
                        response_format: "url"
                    }, {
                        headers: { Authorization: `Bearer ${IMAGE_API.KEY}` }
                    });

                    if (!res.data || !res.data.data || !res.data.data[0]) {
                        throw new Error('API响应格式错误：缺少data字段');
                    }

                    const imageUrl = res.data.data[0].url;
                    if (!imageUrl) {
                        throw new Error('API响应中缺少图片URL');
                    }

                    console.log('✅ 图片生成成功');
                    console.log('🔗 图片URL:', imageUrl);
                    console.log('');

                    const imageItem = { imageUrl };
                    imageUrls[idx] = imageItem;

                    // 调用回调函数，传递正确的参数：item对象和当前索引
                    if (onItemSuccess) {
                        await onItemSuccess(imageItem, idx);
                    }

                    return imageItem;
                } catch (error) {
                    retryCount++;
                    console.error(`❌ [图片 ${idx + 1}/${imagePromptList.length}] 第 ${retryCount} 次尝试失败`);
                    console.error('📋 错误状态码:', error.response?.status);
                    console.error('📋 错误信息:', error.message);
                    console.error('');

                    if (retryCount < maxRetries) {
                        console.log(`⏳ [图片 ${idx + 1}/${imagePromptList.length}] 等待 ${retryDelay / 1000} 秒后重试...\n`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    } else {
                        console.error(`❌ 第 ${idx + 1} 张图片生成失败，已达最大重试次数`);
                        console.error('');
                        throw new Error(`图片生成失败 (${error.response?.status || error.message}): ${item.substring(0, 50)}`);
                    }
                }
            }
        };

        await Promise.all(imagePromptList.map((item, idx) => generateSingleImage(item, idx)));

        console.log('✅ 所有图片生成完成');
        console.log('📊 生成图片数量:', imageUrls.filter(Boolean).length);
        console.log('');

        return imageUrls;
    } catch (error) {
        console.error('❌ 批量生成图片失败:', error.message);
        throw error;
    }
};

// ==============================
// 获取首帧和尾帧
// 功能：从图片URL数组中提取相邻的首尾帧对
// 输入：imageUrls（图片URL数组）
// 输出：{ firstFrames, lastFrames }（首尾帧数组对）
// 说明：用于视频生成的首尾帧参考
// 例如：[img1, img2, img3] -> firstFrames=[img1, img2], lastFrames=[img2, img3]
// ==============================
exports.getFirstLastFrames = (imageUrls) => {
    try {
        console.log('\n🎞️ [getFirstLastFrames] 提取首尾帧');
        
        if (!imageUrls || imageUrls.length < 2) {
            throw new Error('图片URL数组长度必须至少为2');
        }
        
        console.log('📊 图片总数:', imageUrls.length);
        console.log('');

        const firstFrames = [];
        const lastFrames = [];

        // 遍历生成相邻成对帧
        for (let i = 0; i < imageUrls.length - 1; i++) {
            if (!imageUrls[i] || !imageUrls[i + 1]) {
                console.warn(`  ⚠️ 帧对 ${i + 1} 包含空URL，跳过`);
                continue;
            }
            
            firstFrames.push(imageUrls[i]);
            lastFrames.push(imageUrls[i + 1]);
            console.log(`  帧对 ${i + 1}: 首帧=${imageUrls[i].substring(0, 50)}... 尾帧=${imageUrls[i + 1].substring(0, 50)}...`);
        }

        if (firstFrames.length === 0) {
            throw new Error('没有有效的帧对');
        }

        console.log('');
        console.log('✅ 首尾帧提取完成');
        console.log('📊 首帧数量:', firstFrames.length);
        console.log('📊 尾帧数量:', lastFrames.length);
        console.log('');

        return { firstFrames, lastFrames };
    } catch (error) {
        console.error('❌ 提取首尾帧失败:', error.message);
        throw error;
    }
};
