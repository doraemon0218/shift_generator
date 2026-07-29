const { app, ensureInit } = require('./app');

const PORT = process.env.PORT || 3000;

ensureInit()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      const { networkInterfaces } = require('os');
      const nets = networkInterfaces();
      let localIP = 'localhost';
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) localIP = net.address;
        }
      }
      console.log(`サーバー起動中:`);
      console.log(`  ローカル:    http://localhost:${PORT}`);
      console.log(`  ネットワーク: http://${localIP}:${PORT}`);
      console.log(`  ※同じWiFi内の端末は上記ネットワークURLでアクセス可能`);
    });
  })
  .catch(err => {
    console.error('起動エラー:', err);
    process.exit(1);
  });
