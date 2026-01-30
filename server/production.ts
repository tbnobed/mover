import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

let pythonProcess: ChildProcess | null = null;

function startPythonServer() {
  const pythonPath = process.env.PYTHONPATH || "./server_python";
  const pythonBin = process.env.PYTHON_BIN || "./venv/bin/python3";
  
  const actualPythonBin = fs.existsSync(pythonBin) ? pythonBin : "python3";
  
  console.log(`[python] Starting with: ${actualPythonBin}`);
  pythonProcess = spawn(actualPythonBin, ["server_python/main.py"], {
    env: { ...process.env, PYTHONPATH: pythonPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  
  pythonProcess.stdout?.on("data", (data) => {
    console.log(`[python] ${data.toString().trim()}`);
  });
  
  pythonProcess.stderr?.on("data", (data) => {
    console.error(`[python] ${data.toString().trim()}`);
  });
  
  pythonProcess.on("close", (code) => {
    console.log(`[python] process exited with code ${code}`);
    if (code !== 0) {
      console.log("[python] Restarting in 5 seconds...");
      setTimeout(startPythonServer, 5000);
    }
  });
}

process.on("exit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});

process.on("SIGTERM", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  process.exit(0);
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function log(message: string) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [server] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

async function main() {
  startPythonServer();
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const { createProxyMiddleware } = await import("http-proxy-middleware");
  
  app.use("/api", createProxyMiddleware({
    target: "http://localhost:5001",
    changeOrigin: true,
    pathRewrite: (path: string) => path.startsWith('/api') ? path : `/api${path}`,
    on: {
      proxyReq: (proxyReq, req: any) => {
        if (req.body && Object.keys(req.body).length > 0) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      }
    }
  }));

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  const distPath = path.resolve(__dirname, "../dist/public");
  app.use(express.static(distPath));
  
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  const port = parseInt(process.env.PORT || "5000");
  httpServer.listen(port, "0.0.0.0", () => {
    log(`Production server running on port ${port}`);
  });
}

main().catch(console.error);
