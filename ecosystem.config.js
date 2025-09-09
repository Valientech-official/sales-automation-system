module.exports = {
  apps: [
    {
      name: 'sales-automation',
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      cwd: '/opt/sales-automation-system',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        BASE_PATH: '/sales'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        BASE_PATH: '/sales'
      },
      log_file: '/var/log/pm2/sales-automation.log',
      out_file: '/var/log/pm2/sales-automation-out.log',
      error_file: '/var/log/pm2/sales-automation-error.log',
      time: true,
      autorestart: true,
      max_restarts: 3,
      min_uptime: '10s',
      max_memory_restart: '1G'
    }
  ]
};