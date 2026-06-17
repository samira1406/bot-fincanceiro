module.exports = {
  apps: [{
    name:            "bot-financas-whatsapp",
    script:          "index.js",
    instances:       1,
    exec_mode:       "fork",
    autorestart:     true,
    watch:           false,
    max_memory_restart: "500M",
    restart_delay:   5000,
    max_restarts:    5,
    min_uptime:      "15s",
    error_file:      "logs/err.log",
    out_file:        "logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    env: { NODE_ENV: "production" },
  }]
}
