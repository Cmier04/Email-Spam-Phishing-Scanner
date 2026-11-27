const { app, BrowserWindow, dialog } = require('electron')

const { spawn } = require("child_process");
const path = require("path");

let mainWindow;
let pythonProcess;

const backendPath = path.join(__dirname, "...", "backend");

// Main function to start backend
function startBackend() {
    const pyCmd = 
        process.env.PYTHON_EXECUTABLE || "python3";

    pythonProcess = spawn(
        pyCmd,
        [
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000"
        ],
        { cwd: backendPath }
    );

    // Startup and Error Messages
    pythonProcess.stdout.on("data", (data) => {
        console.log(`backend: ${data}`);
    });

    pythonProcess.stderr.on("data", (data) => {
        console.log(`Backend: ${data}`);
    });

    pythonProcess.on("error", (error) => {
        console.error("Failed to start backend:", error);
    });

    pythonProcess.on("exit", (code) => {
        console.log(`Backend exited with code ${code}`);
    });
}


async function waitForBackend() {
    const maxAttempts = 60;

    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch("http://127.0.0.1:8000/");

            if (response.ok) {
                return true;
            }
        } catch (error) {
        // not implemented: will show error message
        }

        await new Promise(resolve =>
            settimeout(resolve, 500)
        );
    }

    return false;
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minwidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    const backendReady = await waitForBackend();

    if (!backendReady) {
        dialog.showErrorBox(
            "Backend Error",
            "The backend failed to start."
        );

        app.quit();
        return;
    }

    await mainWindow.loadURL("http://127.0.0.1:5173");
}

app.whenReady().them(async () => {
    startBackend();
    await createWindow();
});

app.on("before-quit", () => {
    if (pythonProcess && !pythonProcess.killed) {
        pythonProcess.kill();
    }
});