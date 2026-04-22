const express = require('express');
const router = express.Router();
const { generateStoryOutline, generateShotScript, generateImagePrompts, generateVideoPrompts } = require('../utils/llm');
const { generateImages, getFirstLastFrames } = require('../utils/image');
const { generateVideos, mosaicVideos, addBgmToVideo } = require('../utils/video');
const { generateTaskId, saveTask, getTask, getStepData, getAllTasks, deleteTask } = require('../utils/cache');
const { waitForUserConfirmation, confirmStep, getWaitingTasks } = require('../utils/stepConfirmation');


// ==============================
// 删除任务接口
// ==============================
router.delete('/task/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        await deleteTask(taskId);

        res.json({
            success: true,
            message: '任务已删除'
        });
    } catch (error) {
        console.error('❌ 删除任务失败:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==============================
// 确认步骤继续执行接口
// ==============================
router.post('/confirm-step', async (req, res) => {
    try {
        const { taskId, step } = req.body;
        
        if (!taskId || !step) {
            return res.status(400).json({ 
                success: false, 
                error: '缺少taskId或step参数' 
            });
        }
        
        console.log(`📥 收到确认请求: taskId=${taskId}, step=${step}`);
        
        // ���发步骤继续执行
        const success = confirmStep(taskId, step);
        
        if (success) {
            res.json({
                success: true,
                message: `步骤${step}已确认，继续执行`
            });
        } else {
            res.status(404).json({
                success: false,
                error: `步骤${step}不在等待状态`
            });
        }
    } catch (error) {
        console.error('❌ 确认步骤失败:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==============================
// 获取等待中的任务列表接口
// ==============================
router.get('/waiting-tasks', async (req, res) => {
    try {
        const waitingTasks = getWaitingTasks();
        res.json({
            success: true,
            tasks: waitingTasks
        });
    } catch (error) {
        console.error('❌ 获取等待任务失败:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==============================
// 进度事件发送函数
// 功能：通过SSE发送进度消息到前端
// 支持单行或多行消息，每行会在前端单独显示
// ==============================
const sendProgress = (res, step, message, percentage, result = null) => {
    res.write(`data: ${JSON.stringify({ step, message, percentage, result })}\n\n`);
    console.log(`[SSE发送] ${message}`);
};

// ==============================
// 获取所有任务列表接口
// ==============================
router.get('/tasks', async (req, res) => {
    try {
        const tasks = await getAllTasks();
        res.json({
            success: true,
            tasks: tasks
        });
    } catch (error) {
        console.error('❌ 获取任务列表失败:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==============================
// 获取任务详情接口
// ==============================
router.get('/task/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        const task = await getTask(taskId);

        if (!task) {
            return res.status(404).json({ success: false, error: '任务不存在' });
        }

        res.json({
            success: true,
            task: task
        });
    } catch (error) {
        console.error('❌ 获取任务详情失败:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==============================
// 删除任务接口
// ==============================
router.delete('/task/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        await deleteTask(taskId);

        res.json({
            success: true,
            message: '任务已删除'
        });
    } catch (error) {
        console.error('❌ 删除任务失败:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==============================
// 更新任务步骤数据接口
// ==============================
router.put('/task/:taskId/step/:stepNum', async (req, res) => {
    try {
        const { taskId, stepNum } = req.params;
        const { data } = req.body;

        if (!data) {
            return res.status(400).json({ success: false, error: '缺少data参数' });
        }

        // 获取任务
        const task = await getTask(taskId);
        if (!task) {
            return res.status(404).json({ success: false, error: '任务不存在' });
        }

        // 更新步骤数据
        const step = parseInt(stepNum);
        await saveTask(taskId, task.inputs, step, data);

        console.log(`✅ 任务 ${taskId} 的步骤 ${step} 已更新`);

        res.json({
            success: true,
            message: '步骤数据已更新'
        });
    } catch (error) {
        console.error('❌ 更新步骤数据失败:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==============================
// SSE 实时进度接口（支持断点续传）
// 功能：通过 Server-Sent Events 实时推送生成进度
// 参数：taskId（任务ID）, startStep（从第几步开始，默认1）
// ==============================
router.get('/generate-full-video-stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        // 解析请求参数
        const { role1, role2, scene, style, bgmKeyword, taskId: existingTaskId, startStep } = req.query;
        const startStepNum = parseInt(startStep) || 1;

        console.log('📝 接收参数:', { role1, role2, scene, style, bgmKeyword, existingTaskId, startStep: startStepNum });

        // 生成或使用现有任务ID
        const inputs = { role1, role2, scene, style };
        const taskId = existingTaskId || generateTaskId(inputs);
        console.log(`📌 任务ID: ${taskId}`);

        // 初始化变量
        let story, shotScript, scene_detail, roles, shot_lists, imagePromptList, imageUrls, firstFrames, lastFrames, videoPromptList, videoUrls, mosaicedVideo, finalVideo;

        // ==============================
        // 步骤1: 生成故事大纲
        // ==============================
        if (startStepNum <= 1) {
            sendProgress(res, 1, '正在生成故事大纲...', 10);
            const storyOutline = await generateStoryOutline(role1, role2, scene, style);
            story = storyOutline.story;

            // 保存故事大纲到缓存
            await saveTask(taskId, inputs, 1, { story });

            console.log('📄 故事内容:', story);
            sendProgress(res, 1, '✅ 故事大纲生成完成！！！', 15, { story });

            // 等待用户确认
            sendProgress(res, 1, '⏸️ 等待用户确认...', 15, { 
                waitingForConfirmation: true,
                taskId,
                nextStep: 2 
            });
            await waitForUserConfirmation(taskId, 1, res);
            sendProgress(res, 1, '▶️ 用户已确认，继续执行...', 15);
        } else {
            sendProgress(res, 1, '⏭️ 跳过步骤1（使用缓存数据）', 15);
            const cachedData = await getStepData(taskId, 1);
            story = cachedData?.story;
            if (!story) throw new Error('缓存中找不到故事数据');
        }

        // ==============================
        // 步骤2: 生成分镜脚本
        // ==============================
        if (startStepNum <= 2) {
            sendProgress(res, 2, '正在生成分镜脚本...', 20);
            shotScript = await generateShotScript(story);
            ({ scene_detail, roles, shot_lists } = shotScript);

            // 保存分镜脚本到缓存
            await saveTask(taskId, inputs, 2, { shotScript });

            console.log('📍 分镜脚本:', shotScript);
            sendProgress(res, 2, '✅ 分镜脚本生成完成！！！', 25, { shotScript });

            // 等待用户确认
            sendProgress(res, 2, '⏸️ 等待用户确认...', 25, { 
                waitingForConfirmation: true,
                taskId,
                nextStep: 3 
            });
            await waitForUserConfirmation(taskId, 2, res);
            sendProgress(res, 2, '▶️ 用户已确认，继续执行...', 25);
        } else {
            sendProgress(res, 2, '⏭️ 跳过步骤2（使用缓存数据）', 25);
            const cachedData = await getStepData(taskId, 2);
            shotScript = cachedData?.shotScript;
            ({ scene_detail, roles, shot_lists } = shotScript);
            if (!shotScript) throw new Error('缓存中找不到分镜脚本数据');
        }

        // ==============================
        // 步骤3: 生成图片提示词
        // ==============================
        if (startStepNum <= 3) {
            sendProgress(res, 3, '正在生成图片提示词...', 30);
            imagePromptList = await generateImagePrompts(shot_lists, scene_detail, roles, style);

            // 保存图片提示词到缓存
            await saveTask(taskId, inputs, 3, { imagePromptList });

            console.log('🖼️ 图片提示词:', imagePromptList);
            sendProgress(res, 3, '✅ 图片提示词生成完成！！！', 35, { imagePromptList });

            // 等待用户确认
            sendProgress(res, 3, '⏸️ 等待用户确认...', 35, { 
                waitingForConfirmation: true,
                taskId,
                nextStep: 4 
            });
            await waitForUserConfirmation(taskId, 3, res);
            sendProgress(res, 3, '▶️ 用户已确认，继续执行...', 35);
        } else {
            sendProgress(res, 3, '⏭️ 跳过步骤3（使用缓存数据）', 35);
            const cachedData = await getStepData(taskId, 3);
            imagePromptList = cachedData?.imagePromptList;
            if (!imagePromptList) throw new Error('缓存中找不到图片提示词数据');
        }

        // ==============================
        // 步骤4: 文生图并提取首尾帧（支持断点续传）
        // ==============================
        if (startStepNum <= 4) {
            sendProgress(res, 4, '正在生成图片...', 40);

            const cachedStep4 = await getStepData(taskId, 4);
            const cachedImageUrls = Array.isArray(cachedStep4?.imageUrls) ? cachedStep4.imageUrls : [];

            // 初始化 imageUrls 数组，用缓存的 URL 填充已完成的位置
            imageUrls = new Array(imagePromptList.length);
            for (let i = 0; i < cachedImageUrls.length; i++) {
                imageUrls[i] = cachedImageUrls[i];
            }

            // 找出所有未完成的位置
            const pendingJobs = [];
            for (let i = 0; i < imagePromptList.length; i++) {
                if (!imageUrls[i]) {
                    pendingJobs.push({ prompt: imagePromptList[i], index: i });
                }
            }

            // 如果有缓存，显示进度
            if (cachedImageUrls.length > 0) {
                console.log(`♻️ 已缓存图片 ${cachedImageUrls.filter(Boolean).length}/${imagePromptList.length} 张，继续补齐缺失部分`);
            }

            // 生成缺失的图片
            if (pendingJobs.length > 0) {
                console.log(`📊 需要生成 ${pendingJobs.length} 张图片`);
                const pendingPrompts = pendingJobs.map(item => item.prompt);

                await generateImages(pendingPrompts, {
                    onItemSuccess: async (item, idx) => {
                        // idx 是在 pendingPrompts 中的索引，需要映射到原始索引
                        const originalIndex = pendingJobs[idx].index;
                        imageUrls[originalIndex] = item.imageUrl;
                        // 每张成功后立即保存缓存
                        await saveTask(taskId, inputs, 4, { imageUrls: [...imageUrls] });
                        console.log(`💾 图片缓存已增量保存: ${originalIndex + 1}/${imagePromptList.length}`);
                        sendProgress(res, 4, `生成图片 ${originalIndex + 1}/${imagePromptList.length}...`, 40 + (originalIndex / imagePromptList.length) * 5);
                    }
                });

            } else {
                console.log('✅ 所有图片已缓存，无需重新生成');
            }

            // 保存图片到缓存（不保存首尾帧）
            await saveTask(taskId, inputs, 4, { imageUrls: [...imageUrls] });

            console.log('🎨 生成图片urls:', imageUrls);
            sendProgress(res, 4, '✅ 图片生成完成！！！', 50, { imageUrls, imagePromptList });

            // 等待用户确认
            sendProgress(res, 4, '⏸️ 等待用户确认...', 50, { 
                waitingForConfirmation: true,
                taskId,
                nextStep: 5 
            });
            await waitForUserConfirmation(taskId, 4, res);
            sendProgress(res, 4, '▶️ 用户已确认，继续执行...', 50);
        } else {
            sendProgress(res, 4, '⏭️ 跳过步骤4（使用缓存数据）', 50);
            const cachedData = await getStepData(taskId, 4);
            imageUrls = cachedData?.imageUrls;
            if (!imageUrls) throw new Error('缓存中找不到图片URL数据');
        }

        // ==============================
        // 步骤5: 生成视频提示词
        // ==============================
        if (startStepNum <= 5) {
            sendProgress(res, 5, '正在生成视频提示词...', 55);
            videoPromptList = await generateVideoPrompts(imagePromptList);

            // 保存视频提示词到缓存
            await saveTask(taskId, inputs, 5, { videoPromptList });

            console.log('🎬 视频提示词:', videoPromptList);
            sendProgress(res, 5, '✅ 视频提示词生成完成！！！', 60, { videoPromptList });

            // 等待用户确认
            sendProgress(res, 5, '⏸️ 等待用户确认...', 60, { 
                waitingForConfirmation: true,
                taskId,
                nextStep: 6 
            });
            await waitForUserConfirmation(taskId, 5, res);
            sendProgress(res, 5, '▶️ 用户已确认，继续执行...', 60);
        } else {
            sendProgress(res, 5, '⏭️ 跳过步骤5（使用缓存数据）', 60);
            const cachedData = await getStepData(taskId, 5);
            videoPromptList = cachedData?.videoPromptList;
            if (!videoPromptList) throw new Error('缓存中找不到视频提示词数据');
        }

        // ==============================
        // 步骤6: 批量生成视频（支持断点续传）
        // ==============================
        if (startStepNum <= 6) {
            sendProgress(res, 6, '正在生成视频...', 65);
            
            // 从图片URL提取首尾帧（用于视频生成）
            ({ firstFrames, lastFrames } = getFirstLastFrames(imageUrls));
            console.log('🎞️ 首帧数组:', firstFrames);
            console.log('🎞️ 尾帧数组:', lastFrames);

            const cachedStep6 = await getStepData(taskId, 6);
            const cachedVideoUrls = Array.isArray(cachedStep6?.videoUrls) ? cachedStep6.videoUrls : [];

            // 初始化 videoUrls 数组，用缓存的 URL 填充已完成的位置
            videoUrls = new Array(videoPromptList.length);
            for (let i = 0; i < cachedVideoUrls.length; i++) {
                videoUrls[i] = cachedVideoUrls[i];
            }

            // 找出所有未完成的位置
            const pendingVideoJobs = [];
            for (let i = 0; i < videoPromptList.length; i++) {
                if (!videoUrls[i]) {
                    pendingVideoJobs.push({
                        prompt: videoPromptList[i],
                        firstFrame: firstFrames[i],
                        lastFrame: lastFrames[i],
                        index: i
                    });
                }
            }

            // 如果有缓存，显示进度
            if (cachedVideoUrls.length > 0) {
                console.log(`♻️ 已缓存视频 ${cachedVideoUrls.filter(Boolean).length}/${videoPromptList.length} 个，继续补齐缺失部分`);
            }

            // 生成缺失的视频
            if (pendingVideoJobs.length > 0) {
                console.log(`📊 需要生成 ${pendingVideoJobs.length} 个视频`);

                const pendingPrompts = pendingVideoJobs.map(item => item.prompt);
                const pendingFirstFrames = pendingVideoJobs.map(item => item.firstFrame);
                const pendingLastFrames = pendingVideoJobs.map(item => item.lastFrame);

                await generateVideos(pendingPrompts, pendingFirstFrames, pendingLastFrames, {
                    onItemSuccess: async (item, idx) => {
                        // idx 是在 pendingVideoJobs 中的索引，需要映射到原始索引
                        const originalIndex = pendingVideoJobs[idx].index;
                        videoUrls[originalIndex] = item.videoUrl;

                        // 每个视频成功后立即保存缓存
                        await saveTask(taskId, inputs, 6, { videoUrls: [...videoUrls] });
                        console.log(`💾 视频缓存已增量保存: ${originalIndex + 1}/${videoPromptList.length}`);
                        sendProgress(res, 6, `生成视频 ${originalIndex + 1}/${videoPromptList.length}...`, 65 + (originalIndex / videoPromptList.length) * 10);
                    }
                });
            } else {
                console.log('✅ 所有视频已缓存，无需重新生成');
            }

            console.log('✅ 所有视频生成完成');
            console.log('📹 生成视频数量:', videoUrls.length);
            sendProgress(res, 6, '✅ 视频生成完成！！！', 75, { videoUrls, videoPromptList, firstFrames, lastFrames });

            // 等待用户确认
            sendProgress(res, 6, '⏸️ 等待用户确认...', 75, { 
                waitingForConfirmation: true,
                taskId,
                nextStep: 7 
            });
            await waitForUserConfirmation(taskId, 6, res);
            sendProgress(res, 6, '▶️ 用户已确认，继续执行...', 75);
        } else {
            sendProgress(res, 6, '⏭️ 跳过步骤6（使用缓存数据）', 75);
            const cachedData = await getStepData(taskId, 6);
            videoUrls = cachedData?.videoUrls;
            if (!videoUrls) throw new Error('缓存中找不到视频URL数据');
        }

        // ==============================
        // 步骤7: 拼接视频
        // ==============================
        if (startStepNum <= 7) {
            sendProgress(res, 7, '拼接视频...', 80);
            mosaicedVideo = await mosaicVideos(videoUrls);

            // 保存拼接视频到缓存
            await saveTask(taskId, inputs, 7, { mosaicedVideo });

            console.log('✅ 视频拼接完成');
            console.log('🎬 拼接后视频:', mosaicedVideo);
            sendProgress(res, 7, '✅ 视频拼接完成', 90);

            // 等待用户确认
            sendProgress(res, 7, '⏸️ 等待用户确认...', 90, { 
                waitingForConfirmation: true,
                taskId,
                nextStep: 8 
            });
            await waitForUserConfirmation(taskId, 7, res);
            sendProgress(res, 7, '▶️ 用户已确认，继续执行...', 90);
        } else {
            sendProgress(res, 7, '⏭️ 跳过步骤7（使用缓存数据）', 90);
            const cachedData = await getStepData(taskId, 7);
            mosaicedVideo = cachedData?.mosaicedVideo;
            if (!mosaicedVideo) throw new Error('缓存中找不到拼接视频数据');
        }

        // ==============================
        // 步骤8: 添加BGM
        // ==============================
        if (startStepNum <= 8) {
            sendProgress(res, 8, '添加BGM...', 95);
            finalVideo = await addBgmToVideo(mosaicedVideo, bgmKeyword);

            // 保存最终视频到缓存
            await saveTask(taskId, inputs, 8, { finalVideo });

            console.log('✅ BGM添加完成');
            console.log('🎬 最终视频:', finalVideo);
            sendProgress(res, 8, '✅ BGM添加完成', 98);
        } else {
            sendProgress(res, 8, '⏭️ 跳过步骤8（使用缓存数据）', 98);
            const cachedData = await getStepData(taskId, 8);
            finalVideo = cachedData?.finalVideo;
            if (!finalVideo) throw new Error('缓存中找不到最终视频数据');
        }

        // ==============================
        // 发送最终结果
        // ==============================
        console.log('🎉 全部流程完成！');
        await saveTask(taskId, inputs, 8, { finalVideo });
        res.write(`data: ${JSON.stringify({
            step: 'complete',
            message: '🎉 全部流程完成！',
            percentage: 100,
            result: {
                success: true,
                taskId,
                finalVideoUrl: finalVideo,
                story,
                imageUrls,
                videoUrls
            }
        })}\n\n`);
        res.end();
    } catch (error) {
        console.error('❌ 错误:', error.message);
        console.error('📋 错误堆栈:', error.stack);
        res.write(`data: ${JSON.stringify({
            step: 'error',
            message: `❌ 错误：${error.message}`,
            percentage: 0
        })}\n\n`);
        res.end();
    }
});

// ==============================
// POST 接口（兼容性保留）
// 功能：同步方式生成完整视频（不推荐，建议使用SSE接口）
// ==============================
router.post('/generate-full-video', async (req, res) => {
    try {
        // 解析请求体参数
        const { role1, role2, scene, style, bgmKeyword } = req.body;
        console.log('📝 接收参数:', { role1, role2, scene, style, bgmKeyword });

        // ==============================
        // 1. 生成故事大纲
        // 输入：role1, role2, scene, style
        // 输出：story（武侠故事文本）
        // ==============================
        console.log('🎬 [步骤1] 生成故事大纲...');
        const storyOutline = await generateStoryOutline(role1, role2, scene, style);
        const story = storyOutline.story;
        console.log('✅ 故事大纲生成完成，长度:', story.length, '字符');
        console.log('📄 故事内容预览:', story.substring(0, 100) + '...');

        // ==============================
        // 2. 生成分镜脚本
        // 输入：story（故事文本）
        // 输出：scene_detail（场景细节）, roles（角色信息）, shot_lists（分镜列表）
        // ==============================
        console.log('🎬 [步骤2] 生成分镜脚本...');
        const shotScript = await generateShotScript(story);
        const { scene_detail, roles, shot_lists } = shotScript;
        console.log('✅ 分镜脚本生成完成');
        console.log('📍 场景细节:', scene_detail);
        console.log('👥 角色数量:', roles.length);
        console.log('🎬 分镜数量:', shot_lists.length);

        // ==============================
        // 3. 生成图片提示词
        // 输入：shot_lists（分镜列表）, scene_detail（场景）, roles（角色）, style（风格）
        // 输出：imagePromptList（图片提示词数组）
        // ==============================
        console.log('🎬 [步骤3] 生成图片提示词...');
        const imagePromptList = await generateImagePrompts(shot_lists, scene_detail, roles, style);
        console.log('✅ 图片提示词生成完成');
        console.log('🖼️ 图片提示词数量:', imagePromptList.length);
        console.log('📝 第一条提示词预览:', imagePromptList[0]?.substring(0, 80) + '...');

        // ==============================
        // 4. 文生图（调用图片生成API）
        // 输入：imagePromptList（图片提示词数组）
        // 输出：imageUrls（图片URL数组）
        // ==============================
        console.log('🎬 [步骤4] 生成图片...');
        const imageList = await generateImages(imagePromptList);
        const imageUrls = imageList.map(item => item.imageUrl);
        console.log('✅ 图片生成完成');
        console.log('🎨 生成图片数量:', imageUrls.length);
        console.log('🔗 第一张图片URL:', imageUrls[0]);

        // ==============================
        // 5. 获取首帧尾帧
        // 功能：从图片URL数组中提取相邻的首尾帧对
        // 输入：imageUrls（图片URL数组）
        // 输出：firstFrames（首帧数组）, lastFrames（尾帧数组）
        // 说明：用于视频生成的首尾帧参考
        // ==============================
        console.log('🎬 [步骤5] 提取首帧尾帧...');
        const { firstFrames, lastFrames } = getFirstLastFrames(imageUrls);
        console.log('✅ 首帧尾帧提取完成');
        console.log('🎞️ 首帧数量:', firstFrames.length);
        console.log('🎞️ 尾帧数量:', lastFrames.length);

        // ==============================
        // 6. 生成视频提示词
        // 输入：imagePromptList（图片提示词数组）
        // 输出：videoPromptList（视频提示词数组，数量 = 图片数 - 1）
        // 说明：根据相邻两张图片生成过渡动画的视频提示词
        // ==============================
        console.log('🎬 [步骤6] 生成视频提示词...');
        const videoPromptList = await generateVideoPrompts(imagePromptList);
        console.log('✅ 视频提示词生成完成');
        console.log('🎬 视频提示词数量:', videoPromptList.length);
        console.log('📝 第一条视频提示词预览:', videoPromptList[0]?.substring(0, 80) + '...');

        // ==============================
        // 7. 批量生成视频
        // 功能：循环调用视频生成API，为每对首尾帧生成过渡视频
        // 输入：videoPromptList（视频提示词）, firstFrames（首帧）, lastFrames（尾帧）
        // 输出：videoUrls（视频URL数组）
        // 说明：每个视频任务会轮询查询直到完成
        // ==============================
        console.log('🎬 [步骤7] 批量生成视频...');
        const videoUrls = await generateVideos(videoPromptList, firstFrames, lastFrames);
        console.log('✅ 所有视频生成完成');
        console.log('📹 生成视频数量:', videoUrls.length);

        // ==============================
        // 8. 拼接视频
        // 功能：将多个视频片段拼接成一个完整视频
        // 输入：videoUrls（视频URL数组）
        // 输出：mosaicedVideo（拼接后的视频路径/URL）
        // ==============================
        console.log('🎬 [步骤8] 拼接视频...');
        const mosaicedVideo = await mosaicVideos(videoUrls);
        console.log('✅ 视频拼接完成');
        console.log('🎬 拼接后视频:', mosaicedVideo);

        // ==============================
        // 9. 添加BGM
        // 功能：根据关键词获取BGM并混音到视频中
        // 输入：mosaicedVideo（视频路径）, bgmKeyword（BGM关��词）
        // 输出：finalVideo（最终视频路径/URL）
        // ==============================
        console.log('🎬 [步骤9] 添加BGM...');
        const finalVideo = await addBgmToVideo(mosaicedVideo, bgmKeyword);
        console.log('✅ BGM合成完成');
        console.log('🎵 BGM关键词:', bgmKeyword);
        console.log('🎬 最终视频:', finalVideo);

        // ==============================
        // 返回结果
        // ==============================
        console.log('🎉 全部流程完成！');
        res.json({
            success: true,
            finalVideoUrl: finalVideo,
            story,
            imageUrls,
            videoUrls
        });
    } catch (error) {
        console.error('❌ 错误:', error.message);
        console.error('📋 错误堆栈:', error.stack);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
