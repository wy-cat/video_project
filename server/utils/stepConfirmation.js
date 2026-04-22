const EventEmitter = require('events');

// 创建全局事件发射器
const confirmationEmitter = new EventEmitter();

// 存储每个任务的等待状态
const waitingTasks = new Map();

/**
 * 等待用户确认步骤
 * @param {string} taskId - 任务ID
 * @param {number} step - 步骤号
 * @param {object} res - SSE响应对象（用于发送心跳）
 * @returns {Promise<void>}
 */
function waitForUserConfirmation(taskId, step, res = null) {
    return new Promise((resolve) => {
        const key = `confirm_${taskId}_${step}`;
        
        // 记录等待状态
        waitingTasks.set(key, {
            taskId,
            step,
            startTime: Date.now()
        });
        
        console.log(`⏸️ 步骤${step}等待用户确认... (taskId: ${taskId})`);
        
        // 设置心跳，每30秒发送一次（防止SSE连接超时）
        let heartbeat = null;
        if (res) {
            heartbeat = setInterval(() => {
                try {
                    res.write(`data: ${JSON.stringify({
                        step,
                        message: '💓 等待用户确认中...',
                        percentage: null,
                        result: { heartbeat: true }
                    })}\n\n`);
                } catch (error) {
                    console.error('心跳发送失败:', error.message);
                    clearInterval(heartbeat);
                }
            }, 30000);
        }
        
        // 监听确认事件（只监听一次）
        confirmationEmitter.once(key, () => {
            // 清除心跳
            if (heartbeat) {
                clearInterval(heartbeat);
            }
            
            // 移除等待状态
            waitingTasks.delete(key);
            
            const waitTime = ((Date.now() - waitingTasks.get(key)?.startTime) / 1000).toFixed(1);
            console.log(`✅ 收到步骤${step}的确认信号 (等待时间: ${waitTime}秒)`);
            
            resolve();
        });
    });
}

/**
 * 确认步骤，触发继续执行
 * @param {string} taskId - 任务ID
 * @param {number} step - 步骤号
 */
function confirmStep(taskId, step) {
    const key = `confirm_${taskId}_${step}`;
    
    if (!waitingTasks.has(key)) {
        console.warn(`⚠️ 步骤${step}不在等待状态 (taskId: ${taskId})`);
        return false;
    }
    
    console.log(`📤 触发步骤${step}继续执行 (taskId: ${taskId})`);
    confirmationEmitter.emit(key);
    return true;
}

/**
 * 获取所有等待中的任务
 * @returns {Array}
 */
function getWaitingTasks() {
    const tasks = [];
    waitingTasks.forEach((value, key) => {
        tasks.push({
            key,
            ...value,
            waitingTime: Date.now() - value.startTime
        });
    });
    return tasks;
}

/**
 * 清除指定任务的所有等待状态
 * @param {string} taskId - 任务ID
 */
function clearTaskWaiting(taskId) {
    const keysToDelete = [];
    waitingTasks.forEach((value, key) => {
        if (value.taskId === taskId) {
            keysToDelete.push(key);
        }
    });
    
    keysToDelete.forEach(key => {
        confirmationEmitter.emit(key); // 触发resolve
        waitingTasks.delete(key);
    });
    
    console.log(`🧹 清除任务${taskId}的所有等待状态 (共${keysToDelete.length}个)`);
}

module.exports = {
    waitForUserConfirmation,
    confirmStep,
    getWaitingTasks,
    clearTaskWaiting
};