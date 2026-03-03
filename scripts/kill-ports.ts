import { execSync } from 'child_process'

const ports = [3000, 4317, 4318, 5173]

console.log('🧹 Clearing ports...')

for (const port of ports) {
  try {
    const stdout = execSync(`lsof -t -i:${port}`).toString().trim()
    if (stdout) {
      const pids = stdout.split('\n')
      for (const pid of pids) {
        console.log(`🔫 Killing process ${pid} on port ${port}...`)
        process.kill(parseInt(pid), 'SIGKILL')
      }
    }
  } catch (e) {
    // Port is likely free
  }
}

console.log('✅ Ports cleared.\n')
