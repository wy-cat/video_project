const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// 缓存目录
const CACHE_DIR = path.join(__dirname, '../../cache');
const taskWriteLocks = new Map();

// ==============================
// 初始化缓存目录
// ==============================
async function ensureCacheDir() {
    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
    } catch (error) {
        console.error('❌ 创建缓存目录失败:', error.message);
        throw error;
    }
}

// ==============================
// 生成任务ID（基于输入参数的哈希）
// ==============================
function generateTaskId(inputs) {
    const { role1, role2, scene, style } = inputs;
    const str = `${role1}|${role2}|${scene}|${style}`;
    return crypto.createHash('md5').update(str).digest('hex');
}

// ==============================
// 获取任务文件路径
// ==============================
function getTaskFilePath(taskId) {
    return path.join(CACHE_DIR, `${taskId}.json`);
}

// ==============================
// 保存任务数据
// ==============================
async function saveTask(taskId, inputs, stepNumber, stepData) {
    const previousWrite = taskWriteLocks.get(taskId) || Promise.resolve();
    const nextWrite = previousWrite
        .catch(() => {})
        .then(async () => {
            try {
                await ensureCacheDir();
                
                const filePath = getTaskFilePath(taskId);
                let taskData = {};
                
                // 如果任务文件已存在，读取现有数据
                try {
                    const content = await fs.readFile(filePath, 'utf8');
                    taskData = JSON.parse(content);
                } catch (error) {
                    // 文件不存在，创建新任务
                    taskData = {
                        taskId,
                        inputs,
                        steps: {},
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                }
                
                // 更新步骤数据
                taskData.steps[stepNumber] = {
                    data: stepData,
                    timestamp: new Date().toISOString()
                };
                taskData.updatedAt = new Date().toISOString();
                
                // 保存到文件
                await fs.writeFile(filePath, JSON.stringify(taskData, null, 2), 'utf8');
                console.log(`✅ 任务数据已保存: ${taskId} (步骤 ${stepNumber})`);
                
                return taskData;
            } catch (error) {
                console.error('❌ 保存任务数据失败:', error.message);
                throw error;
            }
        });

    taskWriteLocks.set(taskId, nextWrite);

    try {
        return await nextWrite;
    } finally {
        if (taskWriteLocks.get(taskId) === nextWrite) {
            taskWriteLocks.delete(taskId);
        }
    }
}

// ==============================
// 读取任务数据
// ==============================
async function getTask(taskId) {
    try {
        await ensureCacheDir();
        
        const filePath = getTaskFilePath(taskId);
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null; // 任务不存在
        }
        console.error('❌ 读取任务数据失败:', error.message);
        throw error;
    }
}

// ==============================
// 获取某个步骤的数据
// ==============================
async function getStepData(taskId, stepNumber) {
    try {
        const task = await getTask(taskId);
        if (!task || !task.steps[stepNumber]) {
            return null;
        }
        return task.steps[stepNumber].data;
    } catch (error) {
        console.error(`❌ 获取步骤 ${stepNumber} 数据失败:`, error.message);
        throw error;
    }
}

// ==============================
// 获取所有任务列表
// ==============================
async function getAllTasks() {
    try {
        await ensureCacheDir();
        
        const files = await fs.readdir(CACHE_DIR);
        const tasks = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = await fs.readFile(path.join(CACHE_DIR, file), 'utf8');
                    const task = JSON.parse(content);
                    tasks.push({
                        taskId: task.taskId,
                        inputs: task.inputs,
                        completedSteps: Object.keys(task.steps).map(Number).sort((a, b) => a - b),
                        createdAt: task.createdAt,
                        updatedAt: task.updatedAt
                    });
                } catch (error) {
                    console.warn(`⚠️ 读取任务文件失败: ${file}`);
                }
            }
        }
        
        return tasks;
    } catch (error) {
        console.error('❌ 获取任务列表失败:', error.message);
        throw error;
    }
}

// ==============================
// 删除任务
// ==============================
async function deleteTask(taskId) {
    try {
        const filePath = getTaskFilePath(taskId);
        await fs.unlink(filePath);
        console.log(`✅ 任务已删除: ${taskId}`);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`⚠️ 任务不存在: ${taskId}`);
            return;
        }
        console.error('❌ 删除任务失败:', error.message);
        throw error;
    }
}

// ==============================
// 清空所有缓存
// ==============================
async function clearAllCache() {
    try {
        await ensureCacheDir();
        
        const files = await fs.readdir(CACHE_DIR);
        for (const file of files) {
            if (file.endsWith('.json')) {
                await fs.unlink(path.join(CACHE_DIR, file));
            }
        }
        console.log('✅ 所有缓存已清空');
    } catch (error) {
        console.error('❌ 清空缓存失败:', error.message);
        throw error;
    }
}

module.exports = {
    generateTaskId,
    saveTask,
    getTask,
    getStepData,
    getAllTasks,
    deleteTask,
    clearAllCache
};
