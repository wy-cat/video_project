const express = require('express');
const cors = require('cors');
const path = require('path'); // 引入 path 模块
const { PORT } = require('./config');
const videoRouter = require('./routes/video');

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 让 express 把项目根目录下的 public/ 文件夹作为静态资源目录
app.use(express.static(path.join(__dirname, '../public')));

// 路由
app.use('/api/video', videoRouter);

// 启动服务
app.listen(PORT, () => {
    console.log(`后端服务运行在 http://localhost:${PORT}`);
});