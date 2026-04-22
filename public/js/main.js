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
    5: '视频提示词',
    6: '生成视频',
    7: '拼接视频',
    8: '添加BGM'
};

// 添加步骤输出并更新显示
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

// 根据步骤和结果数据格式化显示内容
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
        case 5: // 视频提示词
            return formatVideoPromptsResult(result);
        case 6: // 生成视频
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

// 显示图片提示词模态框（带编辑和重新生成功能）
function showImagePrompt(index, prompt) {
    const unescapedPrompt = prompt.replace(/\\'/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>图片 ${index + 1} - 提示词</h3>
                <div class="modal-header-actions">
                    <button class="regenerate-btn" onclick="regenerateSingleImage(${index})">🔄 重新生成</button>
                    <button class="edit-btn" onclick="editImagePrompt(${index}, '${escapeHtml(unescapedPrompt)}')">✏️ 编辑</button>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.parentElement.remove()">×</button>
                </div>
            </div>
            <div class="modal-body">
                <p id="imagePromptText_${index}">${unescapedPrompt}</p>
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

// 编辑图片提示词
function editImagePrompt(index, prompt) {
    const unescapedPrompt = prompt.replace(/\\'/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const textElement = document.getElementById(`imagePromptText_${index}`);
    
    if (!textElement) return;
    
    // 替换为可编辑的textarea
    textElement.outerHTML = `
        <div>
            <textarea id="imagePromptEdit_${index}" rows="8" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">${unescapedPrompt}</textarea>
            <div style="margin-top: 10px; display: flex; gap: 8px;">
                <button class="save-btn" onclick="saveImagePromptEdit(${index})">💾 保存</button>
                <button class="cancel-btn" onclick="cancelImagePromptEdit(${index}, '${escapeHtml(unescapedPrompt)}')">❌ 取消</button>
            </div>
        </div>
    `;
}

// 保存图片提示词编辑
async function saveImagePromptEdit(index) {
    const textarea = document.getElementById(`imagePromptEdit_${index}`);
    if (!textarea) return;
    
    const newPrompt = textarea.value.trim();
    if (!newPrompt) {
        alert('提示词不能为空');
        return;
    }
    
    try {
        // 获取当前步骤3的数据
        const rawData = stepRawData[3];
        if (!rawData || !rawData.imagePromptList) {
            throw new Error('找不到图片提示词数据');
        }
        
        // 更新提示词
        rawData.imagePromptList[index] = newPrompt;
        
        // 更新缓存
        await updateStepCache(3, rawData);
        
        // 更新显示
        stepOutputs[3] = formatStepResult(3, rawData);
        if (currentSelectedStep == 3) {
            renderStepContent(3);
        }
        
        // 关闭弹窗
        document.querySelector('.modal-overlay').remove();
        
        alert('✅ 提示词已更新！');
    } catch (error) {
        console.error('保存失败:', error);
        alert('保存失败: ' + error.message);
    }
}

// 取消图片提示词编辑
function cancelImagePromptEdit(index, originalPrompt) {
    const unescapedPrompt = originalPrompt.replace(/\\'/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const editContainer = document.getElementById(`imagePromptEdit_${index}`).parentElement;
    editContainer.outerHTML = `<p id="imagePromptText_${index}">${unescapedPrompt}</p>`;
}

// 重新生成单个图片
async function regenerateSingleImage(index) {
    alert('单个图片重新生成功能开发中，当前请使用步骤级别的重新生成');
}

// 显示视频信息模态框（提示词+参考图+编辑+重新生成）
function showVideoInfo(index, prompt, firstFrame, lastFrame) {
    const unescapedPrompt = prompt.replace(/\\'/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h3>视频 ${index + 1} - 详细信息</h3>
                <div class="modal-header-actions">
                    <button class="regenerate-btn" onclick="regenerateSingleVideo(${index})">🔄 重新生成</button>
                    <button class="edit-btn" onclick="editVideoPrompt(${index}, '${escapeHtml(unescapedPrompt)}')">✏️ 编辑</button>
                    <button class="modal-close" onclick="this.parentElement.parentElement.parentElement.parentElement.remove()">×</button>
                </div>
            </div>
            <div class="modal-body">
                <div class="modal-section">
                    <h4>视频提示词</h4>
                    <p id="videoPromptText_${index}">${unescapedPrompt}</p>
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

// 编辑视频提示词
function editVideoPrompt(index, prompt) {
    const unescapedPrompt = prompt.replace(/\\'/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const textElement = document.getElementById(`videoPromptText_${index}`);
    
    if (!textElement) return;
    
    // 替换为可编辑的textarea
    textElement.outerHTML = `
        <div>
            <textarea id="videoPromptEdit_${index}" rows="8" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">${unescapedPrompt}</textarea>
            <div style="margin-top: 10px; display: flex; gap: 8px;">
                <button class="save-btn" onclick="saveVideoPromptEdit(${index})">💾 保存</button>
                <button class="cancel-btn" onclick="cancelVideoPromptEdit(${index}, '${escapeHtml(unescapedPrompt)}')">❌ 取消</button>
            </div>
        </div>
    `;
}

// 保存视频提示词编辑
async function saveVideoPromptEdit(index) {
    const textarea = document.getElementById(`videoPromptEdit_${index}`);
    if (!textarea) return;
    
    const newPrompt = textarea.value.trim();
    if (!newPrompt) {
        alert('提示词不能为空');
        return;
    }
    
    try {
        // 获取当前步骤6的数据
        const rawData = stepRawData[6];
        if (!rawData || !rawData.videoPromptList) {
            throw new Error('找不到视频提示词数据');
        }
        
        // 更新提示词
        rawData.videoPromptList[index] = newPrompt;
        
        // 更新缓存
        await updateStepCache(6, rawData);
        
        // 更新显示
        stepOutputs[6] = formatStepResult(6, rawData);
        if (currentSelectedStep == 6) {
            renderStepContent(6);
        }
        
        // 关闭弹窗
        document.querySelector('.modal-overlay').remove();
        
        alert('✅ 提示词已更新！');
    } catch (error) {
        console.error('保存失败:', error);
        alert('保存失败: ' + error.message);
    }
}

// 取消视频提示词编辑
function cancelVideoPromptEdit(index, originalPrompt) {
    const unescapedPrompt = originalPrompt.replace(/\\'/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const editContainer = document.getElementById(`videoPromptEdit_${index}`).parentElement;
    editContainer.outerHTML = `<p id="videoPromptText_${index}">${unescapedPrompt}</p>`;
}

// 重新生成单个视频
async function regenerateSingleVideo(index) {
    alert('单个视频重新生成功能开发中，当前请使用步骤级别的重新生成');
}

// 更新步骤卡片显示（根据stepOutputs数据动态生成卡片）
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

// 选择步骤卡片并显示对应内容
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
    
    // 判断该步骤是否支持编辑（步骤1、2、3、5支持编辑文本内容）
    const isEditable = [1, 2, 3, 5].includes(Number(step));
    // 判断该步骤是否支持重新生成
    const isRegeneratable = [1, 2, 3, 5].includes(Number(step));
    
    let html = '';
    
    // 添加头部（标题和操作按钮）
    html += '<div class="step-output-header">';
    html += `<div class="step-output-title">${STEP_LABELS[step]}</div>`;
    
    if ((isEditable || isRegeneratable) && rawData) {
        html += '<div class="step-output-actions">';
        if (!isEditing) {
            if (isRegeneratable) {
                html += `<button class="regenerate-btn" onclick="regenerateStep(${step})">🔄 重新生成</button>`;
            }
            if (isEditable) {
                html += `<button class="edit-btn" onclick="enterEditMode(${step})">✏️ 编辑</button>`;
            }
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
        case 5: // 视频提示词
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
            case 5: // 视频提示词
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

// 重新生成步骤
async function regenerateStep(step) {
    if (!confirm(`确定要重新生成步骤${step}（${STEP_LABELS[step]}）吗？`)) {
        return;
    }
    
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
            backendStep = backendStep + 1;
        }
        
        // 调用continueFromStep从该步骤重新开始
        await continueFromStep(taskId, backendStep);
    } catch (error) {
        console.error('重新生成失败:', error);
        alert('重新生成失败: ' + error.message);
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
// 重置步骤输出（例如在开始新任务时调用）
function resetStepOutputs() {
    stepOutputs = {};
    currentSelectedStep = null;
    document.getElementById('stepOutputCards').innerHTML = '';
    document.getElementById('stepOutputContent').innerHTML = '<p style="color: #999; text-align: center;">等待步骤完成...</p>';
}

// ==============================
// 获取所有任务列表
// ==============================

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
            
            // 检查是否是需要确认的任务
            const isPending = window.pendingConfirmation && 
                             window.pendingConfirmation.taskId === task.taskId;
            
            // 根据是否需要确认来设置不同的样式和文本
            let buttonStyle, buttonText, buttonOnClick;
            
            if (isPending) {
                // 需要确认：紫色渐变背景 + 闪烁动画
                buttonStyle = `
                    padding: 10px 20px; 
                    font-size: 14px; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; 
                    border: none; 
                    border-radius: 5px; 
                    cursor: pointer; 
                    font-weight: 600;
                    animation: pulse 2s infinite;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                `;
                buttonText = `⏸️ 核对完成，继续下一步(${window.pendingConfirmation.nextStep})`;
                buttonOnClick = `handleContinueWithConfirmation('${task.taskId}', ${window.pendingConfirmation.currentStep}, ${window.pendingConfirmation.nextStep})`;
            } else {
                // 普通继续：绿色背景
                buttonStyle = `
                    padding: 8px 16px; 
                    font-size: 13px; 
                    background: #28a745; 
                    color: white; 
                    border: none; 
                    border-radius: 5px; 
                    cursor: pointer; 
                    font-weight: 500;
                `;
                buttonText = `▶️ 继续下一步(${maxStep + 1})`;
                buttonOnClick = `continueFromStep('${task.taskId}', ${maxStep + 1})`;
            }
            
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
                    ${isPending ? `<div style="margin-bottom: 10px; padding: 8px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 13px; color: #856404;">
                        ⚠️ 步骤 ${window.pendingConfirmation.currentStep} (${STEP_LABELS[window.pendingConfirmation.currentStep]}) 已完成，请核对内容后继续
                    </div>` : ''}
                    <!-- 操作按钮 -->
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button onclick="${buttonOnClick}" 
                                style="${buttonStyle}">
                            ${buttonText}
                        </button>
                        <button onclick="deleteTask('${task.taskId}')" 
                                style="padding: 8px 16px; font-size: 13px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer;">
                            🗑️ 删除任务
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        tasksList.innerHTML = html;
        
        // 添加CSS动画（如果还没有）
        if (!document.getElementById('pulseAnimation')) {
            const style = document.createElement('style');
            style.id = 'pulseAnimation';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
            `;
            document.head.appendChild(style);
        }
    } catch (error) {
        console.error('加载任务列表失败:', error);
    }
}

// ==============================
// 处理带确认的继续（合并了确认和继续逻辑）
// ==============================
async function handleContinueWithConfirmation(taskId, currentStep, nextStep) {
    try {
        console.log(`用户确认步骤${currentStep}，准备继续步骤${nextStep}`);
        
        // 发送确认请求到后端
        const response = await fetch('http://localhost:3001/api/video/confirm-step', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                taskId: taskId,
                step: currentStep
            })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || '确认失败');
        }
        
        console.log(`✅ 步骤${currentStep}已确认，后端将自动继续执行步骤${nextStep}`);
        
        // 清除待确认状态
        window.pendingConfirmation = null;
        
        // 刷新任务列表，移除高亮
        loadTasksList();
        
    } catch (error) {
        console.error('确认步骤失败:', error);
        alert('确认失败: ' + error.message);
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
                if (data.message.includes('✅') && !data.message.includes('等待')) {
                    addStepOutput(data.step, data.message, data.result);
                }
                
                // 检测到等待确认状态
                if (data.result && data.result.waitingForConfirmation) {
                    showContinueButton(data.result.taskId, data.step, data.result.nextStep);
                    return;
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
// 加载指定任务到步骤输出
// ==============================
async function loadTaskToStepOutput(taskId) {
    try {
        console.log('🔄 加载任务到步骤输出:', taskId);
        
        // 获取任务详情
        const taskResponse = await fetch(`http://localhost:3001/api/video/task/${taskId}`);
        const taskData = await taskResponse.json();
        
        if (!taskData.success) {
            alert('获取任务详情失败');
            return;
        }
        
        const task = taskData.task;
        
        // 清空当前步骤输出
        resetStepOutputs();
        
        // 获取已完成的步骤列表
        const completedSteps = Object.keys(task.steps || {}).map(Number).filter(n => !isNaN(n));
        
        if (completedSteps.length === 0) {
            alert('该任务没有已完成的步骤');
            return;
        }
        
        // 显示进度区域
        document.getElementById('progressSection').style.display = 'block';
        
        // 加载每个已完成步骤的数据
        let firstVisibleStep = null;
        
        completedSteps.sort((a, b) => a - b).forEach(step => {
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
                        const step3Data = task.steps[3]?.data;
                        result = { 
                            imageUrls: stepData.imageUrls,
                            imagePromptList: step3Data?.imagePromptList || []
                        };
                    }
                    break;
                case 5:
                    if (stepData.videoPromptList) {
                        result = { videoPromptList: stepData.videoPromptList };
                    }
                    break;
                case 6:
                    if (stepData.videoUrls) {
                        const step5Data = task.steps[5]?.data;
                        result = { 
                            videoUrls: stepData.videoUrls,
                            videoPromptList: step5Data?.videoPromptList || []
                        };
                        // 首尾帧从后端的步骤6结果中获取（后端在生成视频时会提取并返回）
                        if (stepData.firstFrames && stepData.lastFrames) {
                            result.firstFrames = stepData.firstFrames;
                            result.lastFrames = stepData.lastFrames;
                        }
                    }
                    break;
                case 7:
                case 8:
                    // 步骤7（拼接视频）和步骤8（添加BGM）不在前端显示
                    return;
            }
            
            if (result) {
                // 确定前端显示的步骤号
                let visibleStep = step;
                
                // 旧格式兼容：步骤6的视频提示词映射到前端步骤5
                if (step === 6 && stepData.videoPromptList && !stepData.videoUrls) {
                    visibleStep = 5;
                }
                // 旧格式兼容：步骤7的生成视频映射到前端步骤6
                else if (step === 7 && stepData.videoUrls) {
                    visibleStep = 6;
                }
                
                addStepOutput(visibleStep, `✅ ${STEP_LABELS[visibleStep]}`, result, false);
                
                if (firstVisibleStep === null) {
                    firstVisibleStep = visibleStep;
                }
                
                const node = document.querySelector(`.progress-node[data-step="${visibleStep}"]`);
                if (node) {
                    node.classList.add('completed');
                }
            }
        });
        
        // 选中第一个步骤
        if (firstVisibleStep !== null) {
            selectStepCard(firstVisibleStep);
        }
        
        console.log(`✅ 已加载任务 ${taskId} 的数据`);
    } catch (error) {
        console.error('加载任务失败:', error);
        alert('加载任务失败: ' + error.message);
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
                // 不自动选中，只添加到输出列表
                addStepOutput(step, `✅ ${STEP_LABELS[step]}（从缓存加载）`, result, false);
                
                // 记录第一个可见步骤
                if (firstVisibleStep === null) {
                    firstVisibleStep = step;
                }
                
                // 更新进度节点为完成状态
                const node = document.querySelector(`.progress-node[data-step="${step}"]`);
                if (node) {
                    node.classList.add('completed');
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
// 显示"继续下一步"提示（高亮任务列表中的按钮）
// ==============================
function showContinueButton(taskId, currentStep, nextStep) {
    console.log(`步骤${currentStep}完成，等待用户确认后继续步骤${nextStep}`);
    
    // 标记该任务需要确认
    window.pendingConfirmation = {
        taskId: taskId,
        currentStep: currentStep,
        nextStep: nextStep
    };
    
    // 刷新任务列表，高亮显示需要确认的按钮
    loadTasksList();
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
            
            // 更新进度节点和步骤输出
            if (data.step && data.step !== 'complete' && data.step !== 'error') {
                updateProgressNode(data.step);
                
                // 当步骤完成时（显示✅），添加到步骤输出
                if (data.message.includes('✅')) {
                    addStepOutput(data.step, data.message, data.result);
                }
            }
            
            // 输出日志
            log(data.message);

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
