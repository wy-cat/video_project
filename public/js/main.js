// ==============================
// 步骤输出管理
// ==============================
let stepOutputs = {}; // 存储每个步骤的输出内容（HTML格式）
let stepRawData = {}; // 存储每个步骤的原始数据（用于编辑）
let currentSelectedStep = null;
let isEditing = false; // 当前是否处于编辑状态

const STEP_LABELS = {
    1: '生成故事',
    2: '分镜脚本',
    3: '图片提示词',
    4: '生成图片',
    6: '生成视频',
    7: '拼接视频',
    8: '添加BGM'
};

function addStepOutput(step, content, result = null, autoSelect = true) {
    // 如果有result数据，格式化显示
    let displayContent = content;
    if (result) {
        displayContent = formatStepResult(step, result);
        // 保存原始数据用于编辑
        stepRawData[step] = result;
    }
    
    stepOutputs[step] = displayContent;
    updateStepCards();
    
    // 自动选中最新步骤（可选）
    if (autoSelect) {
        selectStepCard(step);
    }
}

function formatStepResult(step, result) {
    const stepNum = Number(step);
    
    switch(stepNum) {
        case 1: // 生成故事
            return formatStoryResult(result);
        case 2: // 分镜脚本
            return formatShotScriptResult(result);
        case 3: // 图片提示词
            return formatImagePromptsResult(result);
        case 4: // 生成图片
            return formatImagesResult(result);
        case 6: // 视频提示词
            return formatVideoPromptsResult(result);
        case 7: // 生成视频
            return formatVideosResult(result);
        default:
            return JSON.stringify(result, null, 2);
    }
}

// 步骤1：故事展示
function formatStoryResult(result) {
    return result.story || '无故事内容';
}

// 步骤2：分镜脚本展示（三个独立框）
function formatShotScriptResult(result) {
    if (!result.shotScript) return '无分镜脚本数据';
    
    const { scene_detail, roles, shot_lists } = result.shotScript;
    
    let html = '<div class="shot-script-container">';
    
    // 场景细节框
    html += '<div class="info-box">';
    html += '<h4>场景细节</h4>';
    html += `<p>${scene_detail || '无'}</p>`;
    html += '</div>';
    
    // 角色信息框
    html += '<div class="info-box">';
    html += '<h4>角色信息</h4>';
    if (roles && Array.isArray(roles)) {
        html += '<ul>';
        roles.forEach(role => {
            // 处理不同的角色数据结构
            const roleDesc = role;
            
            html += `<li>${roleDesc}</li>`;
        });
        html += '</ul>';
    } else {
        html += '<p>无角色信息</p>';
    }
    html += '</div>';
    
    // 分镜列表框
    html += '<div class="info-box">';
    html += '<h4>分镜列表</h4>';
    if (shot_lists && Array.isArray(shot_lists)) {
        html += '<ul>';
        shot_lists.forEach((shot, idx) => {
            // 处理不同的分镜数据结构
            let shotText = '';
            if (typeof shot === 'string') {
                shotText = shot;
            } else if (typeof shot === 'object') {
                const shotNum = shot.镜号 || shot.number || (idx + 1);
                const shotDesc = shot.画面描述 || shot.description || shot['台词/旁白'] || '';
                const shotDuration = shot.镜头时长 || shot.duration || '';
                
                shotText = `镜头${shotNum}`;
                if (shotDuration) shotText += ` (${shotDuration})`;
                shotText += `: ${shotDesc}`;
            }
            html += `<li>${shotText}</li>`;
        });
        html += '</ul>';
    } else {
        html += '<p>无分镜列表</p>';
    }
    html += '</div>';
    
    html += '</div>';
    return html;
}

// 步骤3：图片提示词展示（每个一个框）
function formatImagePromptsResult(result) {
    if (!result.imagePromptList || !Array.isArray(result.imagePromptList)) {
        return '无图片提示词数据';
    }
    
    let html = '<div class="prompts-grid">';
    result.imagePromptList.forEach((prompt, idx) => {
        html += `<div class="prompt-box">`;
        html += `<div class="prompt-number">图片 ${idx + 1}</div>`;
        html += `<div class="prompt-text">${prompt}</div>`;
        html += `</div>`;
    });
    html += '</div>';
    return html;
}

// 步骤4：图片展示（每行两个，可点击查看提示词）
function formatImagesResult(result) {
    if (!result.imageUrls || !Array.isArray(result.imageUrls)) {
        return '无图片数据';
    }
    
    const { imageUrls, imagePromptList } = result;
    
    let html = '<div class="media-grid">';
    imageUrls.forEach((url, idx) => {
        const prompt = imagePromptList ? imagePromptList[idx] : '';
        html += `<div class="media-item">`;
        html += `<img src="${url}" alt="图片${idx + 1}" onclick="showImagePrompt(${idx}, '${escapeHtml(prompt)}')">`;
        html += `<div class="media-caption">图片 ${idx + 1}</div>`;
        html += `</div>`;
    });
    html += '</div>';
    return html;
}

// 步骤6：视频提示词展示（每个一个框）
function formatVideoPromptsResult(result) {
    if (!result.videoPromptList || !Array.isArray(result.videoPromptList)) {
        return '无视频提示词数据';
    }
    
    let html = '<div class="prompts-grid">';
    result.videoPromptList.forEach((prompt, idx) => {
        html += `<div class="prompt-box">`;
        html += `<div class="prompt-number">视频 ${idx + 1}</div>`;
        html += `<div class="prompt-text">${prompt}</div>`;
        html += `</div>`;
    });
    html += '</div>';
    return html;
}

// 步骤7：视频展示（每行两个，可点击查看提示词和参考图）
function formatVideosResult(result) {
    if (!result.videoUrls || !Array.isArray(result.videoUrls)) {
        return '无视频数据';
    }
    
    const { videoUrls, videoPromptList, firstFrames, lastFrames } = result;
    
    let html = '<div class="media-grid">';
    videoUrls.forEach((url, idx) => {
        const prompt = videoPromptList ? videoPromptList[idx] : '';
        const firstFrame = firstFrames ? firstFrames[idx] : '';
        const lastFrame = lastFrames ? lastFrames[idx] : '';
        
        html += `<div class="media-item">`;
        html += `<video src="${url}" controls onclick="showVideoInfo(${idx}, '${escapeHtml(prompt)}', '${firstFrame}', '${lastFrame}')"></video>`;
        html += `<div class="media-caption">视频 ${idx + 1}</div>`;
        html += `</div>`;
    });
    html += '</div>';
    return html;
}

// HTML转义函数
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 显示图片提示词模态框
function showImagePrompt(index, prompt) {
    const unescapedPrompt = prompt.replace(/\\'/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>图片 ${index + 1} - 提示词</h3>
                <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="modal-body">
                <p>${unescapedPrompt}</p>
            </div>
        </div>
    `;
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    document.body.appendChild(modal);
}

// 显示视频信息模态框（提示词+参考图）
function showVideoInfo(index, prompt, firstFrame, lastFrame) {
    const unescapedPrompt = prompt.replace(/\\'/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h3>视频 ${index + 1} - 详细信息</h3>
                <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="modal-section">
                    <h4>视频提示词</h4>
                    <p>${unescapedPrompt}</p>
                </div>
                <div class="modal-section">
                    <h4>参考图</h4>
                    <div class="reference-images">
                        <div class="reference-image-item">
                            <img src="${firstFrame}" alt="首帧">
                            <p>首帧</p>
                        </div>
                        <div class="reference-image-item">
                            <img src="${lastFrame}" alt="尾帧">
                            <p>尾帧</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    document.body.appendChild(modal);
}

function updateStepCards() {
    const cardsContainer = document.getElementById('stepOutputCards');
    cardsContainer.innerHTML = '';
    
    Object.keys(stepOutputs).sort((a, b) => a - b).forEach(step => {
        const card = document.createElement('div');
        card.className = 'step-card';
        card.dataset.step = step;
        
        if (step == currentSelectedStep) {
            card.classList.add('active');
        }
        
        card.innerHTML = `
            <div class="step-card-number">步骤 ${step}</div>
            <div class="step-card-label">${STEP_LABELS[step] || '处理中'}</div>
        `;
        
        card.addEventListener('click', () => selectStepCard(step));
        cardsContainer.appendChild(card);
    });
}

function selectStepCard(step) {
    currentSelectedStep = step;
    isEditing = false; // 切换步骤时退出编辑状态
    
    // 更新卡片高亮
    document.querySelectorAll('.step-card').forEach(card => {
        card.classList.remove('active');
        if (card.dataset.step == step) {
            card.classList.add('active');
        }
    });
    
    // 显示对应内容
    renderStepContent(step);
}

// 渲染步骤内容（包含编辑按钮）
function renderStepContent(step) {
    const contentContainer = document.getElementById('stepOutputContent');
    const content = stepOutputs[step];
    const rawData = stepRawData[step];
    
    if (!content) {
        contentContainer.innerHTML = '<p style="color: #999; text-align: center;">暂无输出内容</p>';
        return;
    }
    
    // 判断该步骤是否支持编辑（步骤1、2、3、6支持编辑文本内容）
    const isEditable = [1, 2, 3, 6].includes(Number(step));
    
    let html = '';
    
    // 添加头部（标���和操作按钮）
    html += '<div class="step-output-header">';
    html += `<div class="step-output-title">${STEP_LABELS[step]}</div>`;
    
    if (isEditable && rawData) {
        html += '<div class="step-output-actions">';
        if (!isEditing) {
            html += `<button class="edit-btn" onclick="enterEditMode(${step})">✏️ 编辑</button>`;
        } else {
            html += `<button class="save-btn" onclick="saveEdit(${step})">💾 保存</button>`;
            html += `<button class="cancel-btn" onclick="cancelEdit(${step})">❌ 取消</button>`;
        }
        html += '</div>';
    }
    
    html += '</div>';
    
    // 添加内容区域
    html += '<div class="step-output-body">';
    if (isEditing) {
        // 编辑模式：显示文本框
        const editableText = getEditableText(step, rawData);
        html += `<textarea id="editTextarea" rows="15">${escapeHtmlForTextarea(editableText)}</textarea>`;
    } else {
        // 查看模式：显示格式化内容
        html += `<pre>${content}</pre>`;
    }
    html += '</div>';
    
    contentContainer.innerHTML = html;
}

// 获取可编辑的文本内容
function getEditableText(step, rawData) {
    const stepNum = Number(step);
    
    switch(stepNum) {
        case 1: // 故事
            return rawData.story || '';
        case 2: // 分镜脚本
            return JSON.stringify(rawData.shotScript, null, 2);
        case 3: // 图片提示词
            return (rawData.imagePromptList || []).join('\n\n---\n\n');
        case 6: // 视频提示词
            return (rawData.videoPromptList || []).join('\n\n---\n\n');
        default:
            return JSON.stringify(rawData, null, 2);
    }
}

// 转义HTML用于textarea
function escapeHtmlForTextarea(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&#039;');
}

// 进入编辑模式
function enterEditMode(step) {
    isEditing = true;
    renderStepContent(step);
}

// 取消编辑
function cancelEdit(step) {
    isEditing = false;
    renderStepContent(step);
}

// 保存编辑
async function saveEdit(step) {
    const textarea = document.getElementById('editTextarea');
    if (!textarea) return;
    
    const newText = textarea.value;
    const stepNum = Number(step);
    
    try {
        // 解析编辑后的内容
        let updatedData = null;
        
        switch(stepNum) {
            case 1: // 故事
                updatedData = { story: newText };
                break;
            case 2: // 分镜脚本
                try {
                    const parsed = JSON.parse(newText);
                    updatedData = { shotScript: parsed };
                } catch (e) {
                    alert('分镜脚本格式错误，请确保是有效的JSON格式');
                    return;
                }
                break;
            case 3: // 图片提示词
                const imagePrompts = newText.split(/\n\s*---\s*\n/).map(p => p.trim()).filter(p => p);
                updatedData = { imagePromptList: imagePrompts };
                break;
            case 6: // 视频提示词
                const videoPrompts = newText.split(/\n\s*---\s*\n/).map(p => p.trim()).filter(p => p);
                updatedData = { videoPromptList: videoPrompts };
                break;
            default:
                alert('该步骤不支持编辑');
                return;
        }
        
        // 更新本地数据
        stepRawData[step] = updatedData;
        stepOutputs[step] = formatStepResult(step, updatedData);
        
        // 调用后端API更新缓存
        await updateStepCache(step, updatedData);
        
        // 退出编辑模式
        isEditing = false;
        renderStepContent(step);
        
        alert('✅ 保存成功！内容已更新到缓存');
    } catch (error) {
        console.error('保存失败:', error);
        alert('保存失败: ' + error.message);
    }
}

// 更新步骤缓存到后端
async function updateStepCache(step, data) {
    try {
        // 获取当前任务ID
        const tasksResponse = await fetch('http://localhost:3001/api/video/tasks');
        const tasksData = await tasksResponse.json();
        
        if (!tasksData.success || tasksData.tasks.length === 0) {
            throw new Error('没有找到当前任务');
        }
        
        const taskId = tasksData.tasks[0].taskId;
        
        // 将前端步骤号映射回后端步骤号
        let backendStep = Number(step);
        if (backendStep >= 6) {
            backendStep = backendStep + 1; // 步骤6及以后需要+1（因为后端有步骤5）
        }
        
        // 调用更新API
        const response = await fetch(`http://localhost:3001/api/video/task/${taskId}/step/${backendStep}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || '更新失败');
        }
        
        console.log('✅ 缓存已更新到后端');
    } catch (error) {
        console.error('更新缓存失败:', error);
        throw error;
    }
}

function resetStepOutputs() {
    stepOutputs = {};
    currentSelectedStep = null;
    document.getElementById('stepOutputCards').innerHTML = '';
    document.getElementById('stepOutputContent').innerHTML = '<p style="color: #999; text-align: center;">等待步骤完成...</p>';
}

// ==============================
// 获取所有任务列表
// ==============================
const INTERNAL_PROGRESS_STEPS = new Set([5]);

function mapBackendStepToVisibleStep(step) {
    const stepNum = Number(step);

    if (Number.isNaN(stepNum) || INTERNAL_PROGRESS_STEPS.has(stepNum)) {
        return null;
    }

    // 后端的第5步（首尾帧提取）在 UI 中隐藏，因此后续步骤整体前移一位
    return stepNum > 5 ? stepNum - 1 : stepNum;
}

async function loadTasksList() {
    try {
        const response = await fetch('http://localhost:3001/api/video/tasks');
        const data = await response.json();
        
        if (!data.success) {
            console.error('获取任务列表失败:', data.error);
            return;
        }
        
        const tasksList = document.getElementById('tasksList');
        
        if (data.tasks.length === 0) {
            tasksList.innerHTML = '<p style="color: #999;">暂无任务历史</p>';
            return;
        }
        
        let html = '<div style="display: grid; gap: 10px;">';
        
        data.tasks.forEach(task => {
            const completedSteps = task.completedSteps.join(', ');
            const maxStep = Math.max(...task.completedSteps);
            const createdDate = new Date(task.createdAt).toLocaleString('zh-CN');
            const updatedDate = new Date(task.updatedAt).toLocaleString('zh-CN');
            
            html += `
                <div style="border: 1px solid #ddd; padding: 12px; border-radius: 5px; background: #f9f9f9;">
                    <div style="margin-bottom: 8px;">
                        <strong>参数:</strong> ${task.inputs.role1} vs ${task.inputs.role2} | ${task.inputs.scene} | ${task.inputs.style}
                    </div>
                    <div style="margin-bottom: 8px; font-size: 12px; color: #666;">
                        <strong>已完成步骤:</strong> ${completedSteps} (最后: 步骤${maxStep})
                    </div>
                    <div style="margin-bottom: 10px; font-size: 12px; color: #999;">
                        创建: ${createdDate} | 更新: ${updatedDate}
                    </div>
                    
                    <!-- 快速操作按钮 -->
                    <div style="margin-bottom: 10px; padding: 8px; background: #e8f4f8; border-radius: 3px;">
                        <div style="font-size: 12px; color: #333; margin-bottom: 6px;"><strong>快速操作:</strong></div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            <button onclick="continueFromStep('${task.taskId}', ${maxStep})" 
                                    style="padding: 6px 10px; font-size: 11px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">
                                ⏭️ 从步骤${maxStep}重新开始
                            </button>
                            <button onclick="continueFromStep('${task.taskId}', ${maxStep + 1})" 
                                    style="padding: 6px 10px; font-size: 11px; background: #17a2b8; color: white; border: none; border-radius: 3px; cursor: pointer;">
                                ▶️ 继续下一步(${maxStep + 1})
                            </button>
                        </div>
                    </div>
                    
                    <!-- 所有步骤选择 -->
                    <div style="margin-bottom: 10px; padding: 8px; background: #f0f0f0; border-radius: 3px;">
                        <div style="font-size: 12px; color: #333; margin-bottom: 6px;"><strong>从任意步骤开始:</strong></div>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            `;
            
            // 为每个步骤添加按钮
            for (let step = 1; step <= 9; step++) {
                const isCompleted = task.completedSteps.includes(step);
                const bgColor = isCompleted ? '#28a745' : '#6c757d';
                const label = isCompleted ? `✓${step}` : step;
                
                html += `
                    <button onclick="continueFromStep('${task.taskId}', ${step})" 
                            title="${isCompleted ? '已完成' : '未完成'} - 从步骤${step}开始"
                            style="padding: 4px 8px; font-size: 11px; background: ${bgColor}; color: white; border: none; border-radius: 3px; cursor: pointer;">
                        ${label}
                    </button>
                `;
            }
            
            html += `
                        </div>
                    </div>
                    
                    <!-- 删除按钮 -->
                    <div style="display: flex; gap: 8px;">
                        <button onclick="deleteTask('${task.taskId}')" 
                                style="padding: 6px 12px; font-size: 12px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">
                            🗑️ 删除任务
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        tasksList.innerHTML = html;
    } catch (error) {
        console.error('加载任务列表失败:', error);
    }
}

// ==============================
// 从指定步骤继续生成
// ==============================
async function continueFromStep(taskId, startStep) {
    const role1 = document.getElementById('role1').value;
    const role2 = document.getElementById('role2').value;
    const scene = document.getElementById('scene').value;
    const style = document.getElementById('style').value;
    const bgm = document.getElementById('bgm').value;

    if (!role1 || !role2 || !scene || !style) {
        alert('请填写所有字段！');
        return;
    }

    // 显示进度
    const progressSection = document.getElementById('progressSection');
    const resultSection = document.getElementById('resultSection');
    const progressLog = document.getElementById('progressLog');
    
    progressSection.style.display = 'block';
    resultSection.style.display = 'none';
    progressLog.innerHTML = '';

    // 重置所有节点状态
    const resetProgressNodes = () => {
        document.querySelectorAll('.progress-node').forEach(node => {
            node.classList.remove('completed', 'active');
        });
    };

    // 更新进度节点状态
    const updateProgressNode = (step) => {
        if (step === null || step === undefined) {
            return;
        }

        document.querySelectorAll('.progress-node.active').forEach(node => {
            node.classList.remove('active');
        });

        const currentNode = document.querySelector(`.progress-node[data-step="${step}"]`);
        if (currentNode) {
            currentNode.classList.add('active');
        }

        for (let i = 1; i < step; i++) {
            const node = document.querySelector(`.progress-node[data-step="${i}"]`);
            if (node) {
                node.classList.remove('active');
                node.classList.add('completed');
            }
        }
    };

    // 日志输出
    const log = (msg) => {
        const lines = msg.split('\n').filter(line => line.trim() !== '');
        lines.forEach(line => {
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = document.createElement('div');
            logEntry.textContent = `[${timestamp}] ${line}`;
            logEntry.style.marginBottom = '2px';
            progressLog.appendChild(logEntry);
        });
        progressLog.scrollTop = progressLog.scrollHeight;
    };

    // 进度条更新
    const updateProgressBar = (percentage) => {
        let progressBar = document.getElementById('progressBar');
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.id = 'progressBar';
            progressBar.style.cssText = 'width: 0%; height: 4px; background: #007bff; transition: width 0.3s; margin-bottom: 10px;';
            progressSection.insertBefore(progressBar, progressLog);
        }
        progressBar.style.width = percentage + '%';
    };

    try {
        resetProgressNodes();
        // 不清空步骤输出，保留已有的缓存数据
        // resetStepOutputs();
        log(`从步骤${startStep}继续生成视频...`);

        // 构建查询参数
        const params = new URLSearchParams({
            role1,
            role2,
            scene,
            style,
            bgmKeyword: bgm,
            taskId,
            startStep
        });

        // 使用 EventSource 连接 SSE 流
        const eventSource = new EventSource(`http://localhost:3001/api/video/generate-full-video-stream?${params}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            updateProgressBar(data.percentage);
            
            if (data.step && data.step !== 'complete' && data.step !== 'error') {
                updateProgressNode(data.step);
                
                // 当步骤完成时（显示✅），添加到步骤输出
                if (data.message.includes('✅') && !INTERNAL_PROGRESS_STEPS.has(Number(data.step))) {
                    addStepOutput(data.step, data.message, data.result);
                }
            }
            
            log(data.message);

            if (data.step === 'complete') {
                eventSource.close();
                
                document.querySelectorAll('.progress-node').forEach(node => {
                    node.classList.remove('active');
                    node.classList.add('completed');
                });
                
                resultSection.style.display = 'block';
                if (data.result) {
                    document.getElementById('finalVideo').src = data.result.finalVideoUrl;
                    document.getElementById('downloadLink').href = data.result.finalVideoUrl;
                    document.getElementById('downloadLink').innerText = '下载最终视频';
                }
                
                // 刷新任务列表
                loadTasksList();
            } else if (data.step === 'error') {
                eventSource.close();
                alert('执行失败：' + data.message);
            }
        };

        eventSource.onerror = (error) => {
            console.error('连接错误:', error);
            eventSource.close();
            log('❌ 连接错误');
            alert('连接失败，请重试');
        };

    } catch (err) {
        log(`❌ 错误：${err.message}`);
        alert('执行失败：' + err.message);
    }
}

// ==============================
// 删除任务
// ==============================
async function deleteTask(taskId) {
    if (!confirm('确定要删除这个任务吗？')) {
        return;
    }
    
    try {
        const response = await fetch(`http://localhost:3001/api/video/task/${taskId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('任务已删除');
            loadTasksList();
        } else {
            alert('删除失败: ' + data.error);
        }
    } catch (error) {
        console.error('删除任务失败:', error);
        alert('删除失败');
    }
}

// ==============================
// 清空所有缓存
// ==============================
async function clearAllCache() {
    if (!confirm('确定要清空所有缓存吗？这将删除所有任务历史！')) {
        return;
    }
    
    try {
        // 获取所有任务
        const response = await fetch('http://localhost:3001/api/video/tasks');
        const data = await response.json();
        
        if (data.success && data.tasks.length > 0) {
            // 删除每个任务
            for (const task of data.tasks) {
                await fetch(`http://localhost:3001/api/video/task/${task.taskId}`, {
                    method: 'DELETE'
                });
            }
        }
        
        // 清空步骤输出卡片
        resetStepOutputs();
        
        // 隐藏进度区域
        document.getElementById('progressSection').style.display = 'none';
        
        alert('所有缓存已清空');
        loadTasksList();
    } catch (error) {
        console.error('清空缓存失败:', error);
        alert('清空缓存失败');
    }
}

// ==============================
// 加载最新任务的缓存数据到步骤输出
// ==============================
async function loadLatestTaskCache() {
    try {
        console.log('🔄 开始加载最新任务缓存...');
        const response = await fetch('http://localhost:3001/api/video/tasks');
        const data = await response.json();
        
        console.log('📋 任务列表响应:', data);
        
        if (!data.success || data.tasks.length === 0) {
            console.log('⚠️ 没有任务或获取失败');
            return;
        }
        
        // 获取最新的任务（第一个）
        const latestTask = data.tasks[0];
        const taskId = latestTask.taskId;
        
        console.log('📌 最新任务ID:', taskId);
        console.log('✅ 已完成步骤:', latestTask.completedSteps);
        
        // 获取任务详情
        const taskResponse = await fetch(`http://localhost:3001/api/video/task/${taskId}`);
        const taskData = await taskResponse.json();
        
        console.log('📦 任务详情响应:', taskData);
        
        if (!taskData.success) {
            console.log('⚠️ 获取任务详情失败');
            return;
        }
        
        const task = taskData.task;
        
        console.log('🔍 任务对象:', task);
        console.log('🔍 任务步骤数据:', task.steps);
        
        // 获取已完成的步骤列表
        const completedSteps = Object.keys(task.steps || {}).map(Number).filter(n => !isNaN(n));
        console.log('📊 已完成步骤列表:', completedSteps);
        
        if (completedSteps.length === 0) {
            console.log('⚠️ 没有已完成的步骤');
            return;
        }
        
        // 显示进度区域
        document.getElementById('progressSection').style.display = 'block';
        
        // 加载每个已完成步骤的数据
        let firstVisibleStep = null;
        
        console.log('🔄 开始遍历已完成步骤...');
        completedSteps.sort((a, b) => a - b).forEach(step => {
            console.log(`\n处理步骤 ${step}:`);
            if (INTERNAL_PROGRESS_STEPS.has(step)) {
                return; // 跳过内部步骤
            }
            
            const stepInfo = task.steps[step];
            if (!stepInfo || !stepInfo.data) return;
            
            const stepData = stepInfo.data;
            
            // 根据步骤类型构建result对象
            let result = null;
            
            switch(step) {
                case 1:
                    if (stepData.story) {
                        result = { story: stepData.story };
                    }
                    break;
                case 2:
                    if (stepData.shotScript) {
                        result = { shotScript: stepData.shotScript };
                    }
                    break;
                case 3:
                    if (stepData.imagePromptList) {
                        result = { imagePromptList: stepData.imagePromptList };
                    }
                    break;
                case 4:
                    if (stepData.imageUrls) {
                        // 需要同时获取步骤3的imagePromptList
                        const step3Data = task.steps[3]?.data;
                        result = { 
                            imageUrls: stepData.imageUrls,
                            imagePromptList: step3Data?.imagePromptList || []
                        };
                    }
                    break;
                case 6:
                    if (stepData.videoPromptList) {
                        result = { videoPromptList: stepData.videoPromptList };
                    }
                    break;
                case 7:
                    if (stepData.videoUrls) {
                        // 需要获取步骤5的首尾帧和步骤6的提示词
                        const step5Data = task.steps[5]?.data;
                        const step6Data = task.steps[6]?.data;
                        result = { 
                            videoUrls: stepData.videoUrls,
                            videoPromptList: step6Data?.videoPromptList || [],
                            firstFrames: step5Data?.firstFrames || [],
                            lastFrames: step5Data?.lastFrames || []
                        };
                    }
                    break;
            }
            
            if (result) {
                const visibleStep = mapBackendStepToVisibleStep(step);
                if (visibleStep !== null) {
                    // 不自动选中，只添加到输出列表
                    addStepOutput(visibleStep, `✅ ${STEP_LABELS[visibleStep]}（从缓存加载）`, result, false);
                    
                    // 记录第一个可见步骤
                    if (firstVisibleStep === null) {
                        firstVisibleStep = visibleStep;
                    }
                    
                    // 更新进度节点为完成状态
                    const node = document.querySelector(`.progress-node[data-step="${visibleStep}"]`);
                    if (node) {
                        node.classList.add('completed');
                    }
                }
            }
        });
        
        // 加载完所有步骤后，选中第一个步骤
        if (firstVisibleStep !== null) {
            selectStepCard(firstVisibleStep);
        }
        
        console.log(`✅ 已加载最新任务 ${taskId} 的缓存数据`);
    } catch (error) {
        console.error('加载最新任务缓存失败:', error);
    }
}

// ==============================
// 页面加载时初始化
// ==============================
document.addEventListener('DOMContentLoaded', () => {
    // 加载任务列表
    loadTasksList();
    
    // 加载最新任务的缓存数据
    loadLatestTaskCache();
    
    // 刷新任务列表按钮
    document.getElementById('refreshTasksBtn').addEventListener('click', loadTasksList);
    
    // 清空缓存按钮
    document.getElementById('clearCacheBtn').addEventListener('click', clearAllCache);
});

// ==============================
// 开始生成按钮
// ==============================
document.getElementById('generateBtn').addEventListener('click', async () => {
    const role1 = document.getElementById('role1').value;
    const role2 = document.getElementById('role2').value;
    const scene = document.getElementById('scene').value;
    const style = document.getElementById('style').value;
    const bgm = document.getElementById('bgm').value;

    if (!role1 || !role2 || !scene || !style) {
        alert('请填写所有字段！');
        return;
    }

    // 显示进度
    const progressSection = document.getElementById('progressSection');
    const resultSection = document.getElementById('resultSection');
    const progressLog = document.getElementById('progressLog');
    const finalVideo = document.getElementById('finalVideo');
    const downloadLink = document.getElementById('downloadLink');
    
    progressSection.style.display = 'block';
    resultSection.style.display = 'none';
    progressLog.innerHTML = '';

    // 重置所有节点状态
    const resetProgressNodes = () => {
        document.querySelectorAll('.progress-node').forEach(node => {
            node.classList.remove('completed', 'active');
        });
    };

    // 更新进度节点状态
    const updateProgressNode = (step) => {
        // 移除所有 active 状态
        document.querySelectorAll('.progress-node.active').forEach(node => {
            node.classList.remove('active');
        });

        // 标记当前步骤为 active（蓝色）
        const currentNode = document.querySelector(`.progress-node[data-step="${step}"]`);
        if (currentNode) {
            currentNode.classList.add('active');
        }

        // 标记之前的步骤为 completed（绿色）
        for (let i = 1; i < step; i++) {
            const node = document.querySelector(`.progress-node[data-step="${i}"]`);
            if (node) {
                node.classList.remove('active');
                node.classList.add('completed');
            }
        }
    };

    // 日志输出（支持多行消息）
    const log = (msg) => {
        // 处理多行消息，每行单独显示
        const lines = msg.split('\n').filter(line => line.trim() !== '');
        lines.forEach(line => {
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = document.createElement('div');
            logEntry.textContent = `[${timestamp}] ${line}`;
            logEntry.style.marginBottom = '2px';
            progressLog.appendChild(logEntry);
        });
        progressLog.scrollTop = progressLog.scrollHeight;
    };

    // 进度条更新
    const updateProgressBar = (percentage) => {
        let progressBar = document.getElementById('progressBar');
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.id = 'progressBar';
            progressBar.style.cssText = 'width: 0%; height: 4px; background: #007bff; transition: width 0.3s; margin-bottom: 10px;';
            progressSection.insertBefore(progressBar, progressLog);
        }
        progressBar.style.width = percentage + '%';
    };

    try {
        resetProgressNodes();
        // 不清空步骤输出，保留已有的缓存数据
        // resetStepOutputs();
        log("开始生成视频...");

        // 构建查询参数
        const params = new URLSearchParams({
            role1,
            role2,
            scene,
            style,
            bgmKeyword: bgm
        });

        // 使用 EventSource 连接 SSE 流
        const eventSource = new EventSource(`http://localhost:3001/api/video/generate-full-video-stream?${params}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            // 更新进度条
            updateProgressBar(data.percentage);
            
            // 更新进度节点
            const visibleStep = mapBackendStepToVisibleStep(data.step);
            if (visibleStep !== null) {
                updateProgressNode(visibleStep);
                
                // 当步骤完成时（显示✅），添加到步骤输出
                if (data.message.includes('✅')) {
                    addStepOutput(visibleStep, data.message, data.result);
                }
            }
            
            // 输出日志：隐藏内部步骤5（首尾帧提取），不在UI进度中单独展示
            if (!INTERNAL_PROGRESS_STEPS.has(Number(data.step))) {
                log(data.message);
            }

            // 如果完成或出错，关��连接
            if (data.step === 'complete') {
                eventSource.close();
                
                // 标记所有节点为完成
                document.querySelectorAll('.progress-node').forEach(node => {
                    node.classList.remove('active');
                    node.classList.add('completed');
                });
                
                // 显示结果
                resultSection.style.display = 'block';
                if (data.result) {
                    finalVideo.src = data.result.finalVideoUrl;
                    downloadLink.href = data.result.finalVideoUrl;
                    downloadLink.innerText = '下载最终视频';
                }
                
                // 刷新任务列表
                loadTasksList();
            } else if (data.step === 'error') {
                eventSource.close();
                alert('执行失败：' + data.message);
            }
        };

        eventSource.onerror = (error) => {
            eventSource.close();
            log('❌ 连接错误');
            alert('连接失败，请重试');
        };

    } catch (err) {
        log(`❌ 错误：${err.message}`);
        alert('执行失败：' + err.message);
    }
});
