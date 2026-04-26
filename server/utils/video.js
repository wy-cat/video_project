const axios = require('axios');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { VIDEO_API } = require('../config');

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
    timeout: 360000
});

// ==============================
// 1. 创建视频任务
// 功能：调用视频生成API创建一个新的视频生成任务
// 输入：vprompt（视频提示词）, shouZhen（首帧图片URL）, weiZhen（尾帧图片URL）
// 输出：taskId（任务ID，用于后续查询）
// API：豆包视频生成API
// ==============================
exports.createVideoTask = async (vprompt, shouZhen, weiZhen) => {
    try {
        console.log('\n🎥开始创建视频任务');
        console.log('📝 提示词长度:', vprompt.length, '字符');
        console.log('📦 首帧URL:', shouZhen.substring(0, 50) + '...');
        console.log('📦 尾帧URL:', weiZhen.substring(0, 50) + '...');
        
        const fullPrompt = `${vprompt}  -resolution=720p -watermark=false -camera_fixed=false`;
        const imageArray = [shouZhen, weiZhen];
        const inputReference = JSON.stringify(imageArray);
        console.log('');

        const res = await axiosInstance.post(VIDEO_API.BASE_URL, {
            model: VIDEO_API.MODEL,
            seconds:"10",
            prompt: fullPrompt,
            input_reference: inputReference
        }, {
            headers: { Authorization: `Bearer ${VIDEO_API.KEY}` }
        });
        console.log('📋 API响应:', JSON.stringify(res.data));
        if (!res.data) {
            throw new Error('API响应为空');
        }
        
        const taskId = res.data.id || res.data.task_id;
        if (!taskId) {
            console.error('❌ 响应中未找到任务ID');
            console.error('📋 API响应:', JSON.stringify(res.data).substring(0, 200));
            throw new Error('API响应中缺少任务ID字段');  
        }
        
        console.log('✅ 视频任务创建成功');
        console.log('📌 任务ID:', taskId);
        console.log('');
        
        return taskId;
    } catch (error) {
        console.error('❌ 创建视频任务失败');
        console.error('📋 错误信息:', error.message);
        console.error('📋 错误状态码:', error.response?.status);
        console.error('📋 错误响应:', error.response?.data ? JSON.stringify(error.response.data).substring(0, 200) : '无');
        console.error('');
        throw error;
    }
};

// ==============================
// 2. 查询视频状态
// 功能：查询指定任务ID的视频生成状态
// 输入：taskId（任务ID）
// 输出：task（任务对象，包含status、error等字段）
// 说明：用于轮询检查视频是否生成完成
// ==============================
exports.getVideoStatus = async (taskId) => {
    try {
        console.log('\n🔍 查询视频状态');
        console.log('📌 任务ID:', taskId);
        
        if (!taskId) {
            throw new Error('任务ID不能为空');
        }
        
        const res = await axiosInstance.get(`${VIDEO_API.BASE_URL}/${taskId}`, {
            headers: { Authorization: `Bearer ${VIDEO_API.KEY}` }
        });
        
        if (!res.data) {
            throw new Error('API响应为空');
        }
        
        const status = res.data.status;
        console.log('📊 当前状态:', status);
        console.log('');
        
        return res.data;
    } catch (error) {
        console.error('❌ 查询视频状态失败');
        console.error('📋 错误信息:', error.message);
        console.error('📋 错误状态码:', error.response?.status);
        console.error('');
        throw error;
    }
};

// ==============================
// 3. 轮询获取视频（核心逻辑）
// 功能：循环轮询视频生成状态，直到完成或超时
// 输入：taskId（任务ID）
// 输出：videoUrl（生成完成的视频URL）
// 参数：maxWait=480000ms（超时时间8分钟）, delay=5000ms（轮询间隔5秒）
// 说明：每5秒查询一次，最多等待8分钟
// ==============================
exports.pollVideoAndGetUrl = async (taskId) => {
    try {
        console.log('\n⏳ 开始轮询视频生成状态');
        console.log('📌 任务ID:', taskId);
        console.log('⏱️ 超时时间: 480000ms (8分钟)');
        console.log('⏱️ 轮询间隔: 5000ms (5秒)');
        console.log('');
        
        const maxWait = 480000; // 8分钟超时（毫秒）
        let waited = 0;
        const delay = 10000; // 10秒轮询一次（毫秒）
        let pollCount = 0;

        while (waited < maxWait) {
            pollCount++;
            console.log(`🔄 [轮询 #${pollCount}] 已等待: ${(waited / 1000).toFixed(0)}秒`);
            
            try {
                const task = await exports.getVideoStatus(taskId);
                const status = task.status;
                console.log(`📊 状态: ${status}`);
                console.log('');

                if (status === 'failed') {
                    console.error('❌ 视频生成失败');
                    console.error('📋 错误原因:', task.error || '未知错误');
                    console.error('');
                    throw new Error(`任务失败: ${task.error || '未知错误'}`);
                }

                if (status === 'completed') {
                    const videoUrl = task.content?.video_url;
                    if (!videoUrl) {
                        console.error('❌ 响应中缺少视频URL');
                        console.error('📋 响应内容:', JSON.stringify(task).substring(0, 200));
                        throw new Error('API响应中缺少video_url字段');
                    }
                    
                    console.log('✅ 视频生成完成！');
                    console.log('🎬 视频URL:', videoUrl.substring(0, 80) + '...');
                    console.log('⏱️ 总耗时:', (waited / 1000).toFixed(0), '秒');
                    console.log('');
                    return videoUrl;
                }

                // 等待后继续轮询
                console.log(`⏳ 等待${delay / 1000}秒后重试...\n`);
                await new Promise(resolve => setTimeout(resolve, delay));
                waited += delay;
            } catch (error) {
                console.error('❌ 轮询过程中出错');
                console.error('📋 错误信息:', error.message);
                console.error('');
                throw error;
            }
        }
        
        console.error('❌ 视频生成超时');
        console.error('⏱️ 已等待:', (maxWait / 1000).toFixed(0), '秒');
        console.error('');
        throw new Error('视频生成超时');
    } catch (error) {
        console.error('❌ 轮询视频失败:', error.message);
        throw error;
    }
};

// ==============================
// 4. 批量生成视频（并行，保持顺序）
// 功能：并行创建视频任务并轮询，最终结果顺序与输入一致
// 输入：videoPromptList（视频提示词数组）, firstFrames（首帧数组）, lastFrames（尾帧数组）, options（可选回调）
// 输出：videoUrls（视频URL数组）
// 说明：每个视频任务独立执行，适合缩短总等待时间；通过下标写回保证输出顺序不变
// options.onItemSuccess: 每个视频完成后的回调函数 (item, originalIndex) => void
// ==============================
exports.generateVideos = async (videoPromptList, firstFrames, lastFrames, options = {}) => {
    try {
        console.log('\n🎬 开始并行生成视频');

        if (!Array.isArray(videoPromptList) || videoPromptList.length === 0) {
            throw new Error('视频提示词列表为空');
        }
        if (!Array.isArray(firstFrames) || !Array.isArray(lastFrames)) {
            throw new Error('首帧或尾帧数组无效');
        }
        if (videoPromptList.length !== firstFrames.length || videoPromptList.length !== lastFrames.length) {
            throw new Error('视频提示词、首帧、尾帧数量不一致');
        }

        console.log('📊 视频数量:', videoPromptList.length);
        console.log('');

        const videoUrls = new Array(videoPromptList.length);
        const onItemSuccess = typeof options.onItemSuccess === 'function' ? options.onItemSuccess : null;

        const generateSingleVideo = async (index) => {
            const prompt = videoPromptList[index];
            const firstFrame = firstFrames[index];
            const lastFrame = lastFrames[index];

            console.log(`🎥 [视频 ${index + 1}/${videoPromptList.length}] 开始生成...`);

            const videoTaskId = await exports.createVideoTask(prompt, firstFrame, lastFrame);
            console.log(`📌 [视频 ${index + 1}/${videoPromptList.length}] 任务ID: ${videoTaskId}`);

            const videoUrl = await exports.pollVideoAndGetUrl(videoTaskId);
            console.log(`✅ [视频 ${index + 1}/${videoPromptList.length}] 生成完成，URL: ${videoUrl}`);

            const videoItem = { videoUrl, taskId: videoTaskId };
            videoUrls[index] = videoUrl;

            if (onItemSuccess) {
                await onItemSuccess(videoItem, index);
            }

            return videoItem;
        };

        await Promise.all(videoPromptList.map((_, index) => generateSingleVideo(index)));

        console.log('✅ 所有视频生成完成');
        console.log('📹 生成视频数量:', videoUrls.filter(Boolean).length);
        console.log('');

        return videoUrls;
    } catch (error) {
        console.error('❌ 批量生成视频失败:', error.message);
        throw error;
    }
};

// ==============================
// 5. 视频拼接
// 功能：将多个视频片段拼接成一个完整视频
// 输入：videoUrls（视频URL数组）
// 输出：mosaicedVideo（拼接后的视频路径/URL）
// 说明：使用FFmpeg进行视频拼接
// ==============================
exports.mosaicVideos = async (videoUrls) => {
    let tempDir = null;
    try {
        console.log('\n🎬 开始拼接视频');
        
        if (!videoUrls || videoUrls.length === 0) {
            throw new Error('视频URL数组为空');
        }
        
        console.log('📹 视频数量:', videoUrls.length);
        console.log('📋 视频URL列表:');
        videoUrls.forEach((url, index) => {
            if (!url) {
                console.warn(`  ⚠️ ${index + 1}. [空URL]`);
            } else {
                console.log(`  ${index + 1}. ${url.substring(0, 60)}...`);
            }
        });
        console.log('');
        
        // 1. 创建临时目录
        tempDir = path.join(__dirname, '../../temp_videos');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        console.log('📁 临时目录:', tempDir);
        
        // 2. 下载所有视频
        console.log('⬇️ 开始下载视频...');
        const localVideoPaths = [];
        for (let i = 0; i < videoUrls.length; i++) {
            const videoPath = await downloadVideo(videoUrls[i], tempDir, i);
            localVideoPaths.push(videoPath);
            console.log(`✅ 已下载第 ${i + 1}/${videoUrls.length} 个视频`);
        }
        
        // 3. 生成拼接列表文件
        const concatFile = path.join(tempDir, 'concat_list.txt');
        const concatContent = localVideoPaths
            .map(p => `file '${p.replace(/\\/g, '\\\\')}'`)
            .join('\n');
        fs.writeFileSync(concatFile, concatContent);
        console.log('📋 拼接列表已生成');
        console.log('📄 拼接列表内容:');
        console.log(concatContent);
        
        // 4. 确保输出目录存在
        const outputDir = path.join(__dirname, '../../public/videos');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const outputPath = path.join(outputDir, `mosaiced_${Date.now()}.mp4`);
        console.log('📁 输出目录:', outputDir);
        console.log('📁 输出文件:', outputPath);
        
        // 5. 执行FFmpeg拼接
        console.log('🔄 执行FFmpeg拼接...');
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(concatFile)
                .inputOptions(['-f concat', '-safe 0'])
                .output(outputPath)
                .outputOptions('-c copy')  // 直接复制，不重新编码（快速）
                .on('start', (cmd) => {
                    console.log('🚀 FFmpeg命令:', cmd);
                })
                .on('progress', (progress) => {
                    console.log(`⏳ 进度: ${progress.percent}%`);
                })
                .on('end', () => {
                    console.log('✅ 视频拼接完成');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('❌ FFmpeg错误:', err.message);
                    reject(err);
                })
                .run();
        });
        
        // 6. 清理临时文件
        console.log('🧹 清理临时文件...');
        localVideoPaths.forEach(p => {
            try { 
                fs.unlinkSync(p);
                console.log(`  ✓ 删除: ${p}`);
            } catch (e) {}
        });
        try { 
            fs.unlinkSync(concatFile);
            console.log(`  ✓ 删除: ${concatFile}`);
        } catch (e) {}
        
        // 7. 返回相对URL路径
        const relativeUrl = `/videos/${path.basename(outputPath)}`;
        console.log('✅ 视频拼接完成');
        console.log('🎬 拼接后视频URL:', relativeUrl);
        console.log('');
        
        return relativeUrl;
    } catch (error) {
        console.error('❌ 视频拼接失败:', error.message);
        throw error;
    }
};

// ==============================
// 辅助函数：下载视频
// ==============================
async function downloadVideo(url, tempDir, index) {
    const videoPath = path.join(tempDir, `video_${index}.mp4`);
    
    console.log(`  📥 下载第 ${index + 1} 个视频...`);
    
    const response = await axiosInstance({
        method: 'get',
        url: url,
        responseType: 'stream'
    });
    
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(videoPath);
        response.data.pipe(writer);
        writer.on('finish', () => {
            console.log(`  ✓ 已保存到: ${videoPath}`);
            resolve(videoPath);
        });
        writer.on('error', (err) => {
            console.error(`  ✗ 下载失败: ${err.message}`);
            reject(err);
        });
    });
}


// // ==============================
// // 6. 获取视频时长
// // 功能：使用FFprobe获取视频的时长
// // 输入：videoPath（视频路径）
// // 输出：duration（时长，单位秒）
// // ==============================
// async function getVideoDuration(videoPath) {
//     return new Promise((resolve, reject) => {
//         ffmpeg.ffprobe(videoPath, (err, metadata) => {
//             if (err) {
//                 console.error('❌ 获取视频时长失败:', err.message);
//                 reject(err);
//             } else {
//                 const duration = metadata.format.duration;
//                 console.log(`⏱️ 视频时长: ${duration.toFixed(2)}秒`);
//                 resolve(duration);
//             }
//         });
//     });
// }

// // ==============================
// // 7. 获取音频时长
// // 功能：使用FFprobe获取音频的时长
// // 输入：audioPath（音频路径）
// // 输出：duration（时长，单位秒）
// // ==============================
// async function getAudioDuration(audioPath) {
//     return new Promise((resolve, reject) => {
//         ffmpeg.ffprobe(audioPath, (err, metadata) => {
//             if (err) {
//                 console.error('❌ 获取音频时长失败:', err.message);
//                 reject(err);
//             } else {
//                 const duration = metadata.format.duration;
//                 console.log(`⏱️ 音频时长: ${duration.toFixed(2)}秒`);
//                 resolve(duration);
//             }
//         });
//     });
// }

// // ==============================
// // 8. 搜索BGM（网易云API）
// // 功能：根据关键词从网易云搜索BGM
// // 输入：keyword（搜索关键词）
// // 输出：bgmList（BGM列表）
// // ==============================
// async function searchBgmFromNetease(keyword) {
//     try {
//         console.log(`🔍 正在搜索BGM: "${keyword}"`);
        
//         // 使用网易云API搜索
//         const response = await axios.get('https://music.163.com/api/search/get', {
//             params: {
//                 s: keyword,
//                 type: 1,  // 1=单曲
//                 limit: 10,
//                 offset: 0
//             },
//             timeout: 10000
//         });
        
//         if (!response.data || !response.data.result || !response.data.result.songs) {
//             console.warn('⚠️ 网易云API返回为空，使用默认BGM');
//             return [];
//         }
        
//         const songs = response.data.result.songs.slice(0, 5);
//         console.log(`✅ 找到 ${songs.length} 首BGM`);
        
//         return songs.map(song => ({
//             id: song.id,
//             name: song.name,
//             artist: song.artists?.[0]?.name || '未知',
//             duration: song.duration / 1000,  // 转换为秒
//             url: `https://music.163.com/song/media/outer/url?id=${song.id}.mp3`
//         }));
//     } catch (error) {
//         console.warn('⚠️ 网易云API搜索失败:', error.message);
//         return [];
//     }
// }

// // ==============================
// // 9. 选择最合适的BGM
// // 功能：根据视频时长选择最接近的BGM
// // 输入：bgmList（BGM列表）, videoDuration（视频时长）
// // 输出：selectedBgm（选中的BGM）
// // ==============================
// function selectBestBgm(bgmList, videoDuration) {
//     if (!bgmList || bgmList.length === 0) {
//         console.warn('⚠️ BGM列表为空，将使用循环播放模式');
//         return null;
//     }
    
//     // 找出时长最接近视频的BGM
//     let bestBgm = bgmList[0];
//     let minDiff = Math.abs(bgmList[0].duration - videoDuration);
    
//     for (let i = 1; i < bgmList.length; i++) {
//         const diff = Math.abs(bgmList[i].duration - videoDuration);
//         if (diff < minDiff) {
//             minDiff = diff;
//             bestBgm = bgmList[i];
//         }
//     }
    
//     console.log(`✅ 选中BGM: ${bestBgm.name} - ${bestBgm.artist}`);
//     console.log(`   BGM时长: ${bestBgm.duration.toFixed(2)}秒, 视频时长: ${videoDuration.toFixed(2)}秒`);
//     console.log(`   时长差异: ${minDiff.toFixed(2)}秒`);
    
//     return bestBgm;
// }

// // ==============================
// // 10. 混音（智能模式）
// // 功能：根据时长差异选择合适的混音方式
// // 输入：videoPath（视频路径）, audioPath（音频路径）, outputPath（输出路径）, videoDuration（视频时长）, audioDuration（音频时长）
// // 输出：无（直接输出文件）
// // ==============================
// async function mixAudioVideoSmart(videoPath, audioPath, outputPath, videoDuration, audioDuration) {
//     const timeDiff = Math.abs(videoDuration - audioDuration);
    
//     return new Promise((resolve, reject) => {
//         let ffmpegCmd = ffmpeg()
//             .input(videoPath)
//             .input(audioPath);
        
//         // 判断是否需要循环播放
//         if (timeDiff > 2 && audioDuration < videoDuration) {
//             // BGM短于视频超过2秒，使用循环播放
//             console.log('🔄 使用循环播放模式（BGM短于视频）');
//             ffmpegCmd = ffmpegCmd.complexFilter('[1:a]aloop=loop=-1:size=2e+06[a]');
//             ffmpegCmd = ffmpegCmd.map('0:v:0').map('[a]');
//         } else {
//             // 直接混音（时长接近或BGM长于视频）
//             console.log('🎵 使用直接混音模式');
//             ffmpegCmd = ffmpegCmd.map('0:v:0').map('1:a:0');
//         }
        
//         ffmpegCmd
//             .outputOptions([
//                 '-c:v copy',      // 视频直接复制
//                 '-c:a aac',       // 音频转AAC
//                 '-shortest'       // 按较短的流长度输出
//             ])
//             .output(outputPath)
//             .on('start', (cmd) => {
//                 console.log('🚀 FFmpeg命令:', cmd);
//             })
//             .on('progress', (progress) => {
//                 console.log(`⏳ 混音进度: ${progress.percent}%`);
//             })
//             .on('end', () => {
//                 console.log('✅ 音视频混音完成');
//                 resolve();
//             })
//             .on('error', (err) => {
//                 console.error('❌ FFmpeg混音错误:', err.message);
//                 reject(err);
//             })
//             .run();
//     });
// }

// // ==============================
// // 11. 添加BGM到视频
// // 功能：根据关键词获取BGM并混音到视频中
// // 输入：videoUrl（视频路径/URL）, bgmKeyword（BGM关键词）
// // 输出：finalVideo（最终视频路径/URL）
// // 说明：实现方案1 + 方案3的组合（循环播放 + 智能选择）
// // ==============================
// exports.addBgmToVideo = async (videoUrl, bgmKeyword) => {
//     let tempDir = null;
//     let bgmPath = null;
    
//     try {
//         console.log('\n🎵 开始添加BGM');
        
//         if (!videoUrl) {
//             throw new Error('视频URL不能为空');
//         }
//         if (!bgmKeyword) {
//             throw new Error('BGM关键词不能为空');
//         }
        
//         console.log('🎬 视频路径:', videoUrl.substring(0, 60) + '...');
//         console.log('🎵 BGM关键词:', bgmKeyword);
//         console.log('');
        
//         // 1. 创建临时目录
//         tempDir = path.join(__dirname, '../../temp_bgm');
//         if (!fs.existsSync(tempDir)) {
//             fs.mkdirSync(tempDir, { recursive: true });
//         }
//         console.log('📁 临时目录:', tempDir);
        
//         // 2. 获取视频时长
//         const videoDuration = await getVideoDuration(videoUrl);
        
//         // 3. 搜索BGM
//         const bgmList = await searchBgmFromNetease(bgmKeyword);
        
//         // 4. 选择最合适的BGM
//         let selectedBgm = selectBestBgm(bgmList, videoDuration);
        
//         // 5. 如果没有找到BGM，提示用户
//         if (!selectedBgm) {
//             console.warn('⚠️ 未找到合适的BGM，将使用循环播放模式');
//             console.log('💡 提示：请确保网络连接正常，或提供有效的BGM关键词');
//             // 返回原视频（不添加BGM）
//             return videoUrl;
//         }
        
//         // 6. 下载BGM
//         console.log('⬇️ 开始下载BGM...');
//         bgmPath = path.join(tempDir, `bgm_${Date.now()}.mp3`);
        
//         const response = await axiosInstance({
//             method: 'get',
//             url: selectedBgm.url,
//             responseType: 'stream'
//         });
        
//         await new Promise((resolve, reject) => {
//             const writer = fs.createWriteStream(bgmPath);
//             response.data.pipe(writer);
//             writer.on('finish', () => {
//                 console.log('✅ BGM下载完成');
//                 resolve();
//             });
//             writer.on('error', (err) => {
//                 console.error('❌ BGM下载失败:', err.message);
//                 reject(err);
//             });
//         });
        
//         // 7. 获取BGM时长
//         const audioDuration = await getAudioDuration(bgmPath);
        
//         // 8. 确保输出目录存在
//         const outputDir = path.join(__dirname, '../../public/videos');
//         if (!fs.existsSync(outputDir)) {
//             fs.mkdirSync(outputDir, { recursive: true });
//         }
        
//         const outputPath = path.join(outputDir, `final_video_${Date.now()}.mp4`);
//         console.log('📁 输出文件:', outputPath);
        
//         // 9. 智能混音
//         console.log('🎵 开始混音...');
//         await mixAudioVideoSmart(videoUrl, bgmPath, outputPath, videoDuration, audioDuration);
        
//         // 10. 清理临时文件
//         console.log('🧹 清理临时文件...');
//         if (bgmPath && fs.existsSync(bgmPath)) {
//             fs.unlinkSync(bgmPath);
//             console.log('✓ 删除BGM临时文件');
//         }
        
//         // 11. 返回相对URL路径
//         const relativeUrl = `/videos/${path.basename(outputPath)}`;
//         console.log('✅ BGM添加完成');
//         console.log('🎬 最终视频URL:', relativeUrl);
//         console.log('');
        
//         return relativeUrl;
//     } catch (error) {
//         console.error('❌ 添加BGM失败:', error.message);
        
//         // 清理临时文件
//         if (bgmPath && fs.existsSync(bgmPath)) {
//             try { fs.unlinkSync(bgmPath); } catch (e) {}
//         }
        
//         throw error;
//     }
// };
