const { ChatOpenAI } = require("@langchain/openai");
const fs = require("fs/promises");
const path = require("path");
const { LLM } = require('../config');

// 初始化 LLM（你指定的 gpt-5.4-high）
const llm = new ChatOpenAI({
    apiKey: LLM.API_KEY,
    configuration: { baseURL: LLM.BASE_URL },
    modelName: LLM.MODEL_NAME,
    temperature: 0.7,
});

// ------------------------------
// 工具函数：读取提示词文件（优先 .md，兼容 .txt）
// ------------------------------
async function loadPrompt(fileName) {
    const baseName = path.parse(fileName).name;
    const candidates = [
        path.join(__dirname, "prompts", `${baseName}.md`),
        path.join(__dirname, "prompts", `${baseName}.txt`),
        path.join(__dirname, "prompts", fileName),
    ];

    for (const filePath of candidates) {
        try {
            return await fs.readFile(filePath, "utf8");
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    throw new Error(`Prompt file not found: ${fileName}`);
}

// 工具函数：安全的JSON解析（带详细错误日志）
// ------------------------------
function safeJsonParse(content, functionName) {
    try {
        return JSON.parse(content);
    } catch (error) {
        console.error(`\n❌ [${functionName}] JSON解析失败`);
        console.error('📋 错误信息:', error.message);
        console.error('📋 错误位置:', error.stack);
        console.error('📋 原始响应内容（前500字符）:');
        console.error(content.substring(0, 500));
        if (content.length > 500) {
            console.error('... (内容过长，已截断)');
        }
        console.error('');
        throw new Error(`${functionName} - JSON解析失败: ${error.message}`);
    }
}

// ------------------------------
// 1. 生成故事大纲（从 story.md 读取）
// ------------------------------
exports.generateStoryOutline = async (role1, role2, scene, style) => {
    try {
        console.log('\n📖 [generateStoryOutline] 开始生成故事大纲');
        console.log('📝 参数:', { role1, role2, scene, style });
        
        let template = await loadPrompt("story.md");

        // 替换模板里的变量
        template = template
            .replaceAll("{{role1}}", role1)
            .replaceAll("{{role2}}", role2)
            .replaceAll("{{scene}}", scene)
            .replaceAll("{{style}}", style);

        const res = await llm.invoke(template);
        const content = res.content.trim();
        console.log('✅ 故事大纲生成成功');
        
        return safeJsonParse(content, 'generateStoryOutline');
    } catch (error) {
        console.error('❌ 生成故事大纲失败:', error.message);
        throw error;
    }
};

// ------------------------------
// 2. 生成分镜脚本（从 shot.md 读取）
// ------------------------------
exports.generateShotScript = async (story) => {
    try {
        console.log('\n🎬 [generateShotScript] 开始生成分镜脚本');
        console.log('📝 故事长度:', story.length, '字符');
        
        let template = await loadPrompt("shot.md");

        // 替换模板里的变量
        template = template.replaceAll("{{story}}", story);

        const res = await llm.invoke(template);
        const content = res.content.trim();
        console.log('✅ 分镜脚本生成成功');
        
        return safeJsonParse(content, 'generateShotScript');
    } catch (error) {
        console.error('❌ 生成分镜脚本失败:', error.message);
        throw error;
    }
};

// ------------------------------
// 3. 生成图片提示词（从 image.md 读取）
// 并发生成所有图片提示词
// ------------------------------
exports.generateImagePrompts = async (shot_lists, scene_detail, roles, style) => {
    try {
        console.log('\n🖼️ [generateImagePrompts] 开始生成图片提示词');
        console.log('📊 分镜数量:', shot_lists.length);
        
        let template = await loadPrompt("image.md");

        // 创建并发任务数组
        const tasks = shot_lists.map(async (shot_script, idx) => {
            try {
                console.log(`\n  [图片提示词 ${idx + 1}/${shot_lists.length}] 生成中...`);

                // ✅ 模拟 Coze：对象自动��字符串
                const shotStr = JSON.stringify(shot_script, null, 2);
                const rolesStr = JSON.stringify(roles, null, 2);
                const sceneStr = JSON.stringify(scene_detail, null, 2);

                const prompt = template
                    .replaceAll("{{scene_detail}}", sceneStr)
                    .replaceAll("{{roles}}", rolesStr)
                    .replaceAll("{{shot_script}}", shotStr)
                    .replaceAll("{{style}}", style);

                const res = await llm.invoke(prompt);
                const content = res.content.trim();
                const json = safeJsonParse(content, `generateImagePrompts[${idx + 1}]`);
                
                console.log(`  ✅ 图片提示词 ${idx + 1} 生成成功`);
                return json.imagePrompt;
            } catch (error) {
                console.error(`  ❌ 图片 ${idx + 1} 生成失败:`, error.message);
                throw error;
            }
        });

        // 并发执行所有任务
        const imagePromptList = await Promise.all(tasks);

        console.log('\n✅ 所有图片提示词生成完成');
        return imagePromptList;
    } catch (error) {
        console.error('❌ 生成图片提示词失败:', error.message);
        throw error;
    }
};

// ------------------------------
// 4. 视频提示词生成（按相邻成对批处理，输入图片提示词数组，输出数量-1）
// 输入：imagePromptList = [prompt1, prompt2, prompt3...]
// 输出：videoPromptList = [prompt1-2, prompt2-3...]
// 并发生成所有视频提示词
// ------------------------------
exports.generateVideoPrompts = async (imagePromptList) => {
    try {
        console.log('\n🎥 [generateVideoPrompts] 开始生成视频提示词');
        console.log('📊 图片提示词数量:', imagePromptList.length);
        console.log('📊 将生成视频提示词数量:', imagePromptList.length - 1);
        
        // 只读取一次模板，避免重复IO
        let template = await loadPrompt("video.md");

        // ���建并发任务数组
        const tasks = [];
        for (let i = 0; i < imagePromptList.length - 1; i++) {
            const task = (async (index) => {
                try {
                    console.log(`\n  [视频提示词 ${index + 1}/${imagePromptList.length - 1}] 生成中...`);
                    
                    // 当前循环的两个相邻提示词
                    const currentPrompt = imagePromptList[index];
                    const nextPrompt = imagePromptList[index + 1];

                    // 把两个提示词拼接成一段文本，替换模板中的{{image_prompt}}变量
                    const combinedPrompt = `第一个描述词：${currentPrompt}\n第二个描述词：${nextPrompt}`;
                    const finalTemplate = template.replaceAll("{{image_prompt}}", combinedPrompt);

                    // 调用模型生成当前成对的视频提示词
                    const res = await llm.invoke(finalTemplate);
                    const content = res.content.trim();
                    const json = safeJsonParse(content, `generateVideoPrompts[${index + 1}]`);

                    console.log(`  ✅ 视频提示词 ${index + 1} 生成成功`);
                    return json.videoPrompt || json;
                } catch (error) {
                    console.error(`  ❌ 视频 ${index + 1} 生成失败:`, error.message);
                    throw error;
                }
            })(i);
            
            tasks.push(task);
        }

        // 并发执行所有任务
        const videoPromptList = await Promise.all(tasks);

        console.log('\n✅ 所有视频提示词生成完成');
        return videoPromptList;
    } catch (error) {
        console.error('❌ 生成视频提示词失败:', error.message);
        throw error;
    }
};
