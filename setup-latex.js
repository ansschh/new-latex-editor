// setup-latex.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n===== LaTeX Editor Setup =====\n');

// Check if Docker is installed
let dockerInstalled = false;
try {
  execSync('docker --version', { stdio: 'ignore' });
  dockerInstalled = true;
  console.log('✅ Docker is installed');
} catch (error) {
  console.log('❌ Docker is not installed');
}

// Check if pdflatex is installed
let pdflatexInstalled = false;
try {
  execSync('pdflatex --version', { stdio: 'ignore' });
  pdflatexInstalled = true;
  console.log('✅ pdfLaTeX is installed');
} catch (error) {
  console.log('❌ pdfLaTeX is not installed');
}

// Create temp directory
const tempDir = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log('✅ Created tmp directory');
} else {
  console.log('✅ tmp directory already exists');
}

// Create or update .env.local file
const createEnvFile = () => {
  const envPath = path.join(process.cwd(), '.env.local');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }
  
  // Update LaTeX configuration
  const useDocker = dockerInstalled && !pdflatexInstalled;
  
  if (!envContent.includes('USE_DOCKER=')) {
    envContent += `\n# LaTeX Compilation Settings\nUSE_DOCKER=${useDocker}\n`;
  } else {
    envContent = envContent.replace(
      /USE_DOCKER=.*/,
      `USE_DOCKER=${useDocker}`
    );
  }
  
  if (!envContent.includes('PDFLATEX_PATH=')) {
    envContent += `PDFLATEX_PATH=pdflatex\n`;
  }
  
  if (!envContent.includes('TMP_DIR=')) {
    envContent += `TMP_DIR=${tempDir.replace(/\\/g, '/')}\n`;
  }
  
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Updated .env.local file');
};

const setupDocker = () => {
  if (!dockerInstalled) {
    console.log('\n⚠️  Docker is not installed. We recommend installing Docker to compile LaTeX documents.');
    console.log('   Download Docker from: https://www.docker.com/products/docker-desktop');
    return false;
  }
  
  console.log('\n🔄 Pulling the TeX Live Docker image (this may take a while)...');
  try {
    execSync('docker pull texlive/texlive', { stdio: 'inherit' });
    console.log('✅ Successfully pulled TeX Live Docker image');
    return true;
  } catch (error) {
    console.error('❌ Failed to pull TeX Live Docker image:', error.message);
    return false;
  }
};

const recommendLatexInstallation = () => {
  console.log('\n📋 LaTeX Installation Recommendations:');
  
  if (!pdflatexInstalled && !dockerInstalled) {
    console.log('\n  Option 1: Install TeX Live or MiKTeX (Recommended for best performance)');
    console.log('   - Windows: Download from https://miktex.org/ or https://tug.org/texlive/');
    console.log('   - macOS: Download MacTeX from https://tug.org/mactex/');
    console.log('   - Linux: Use your package manager (e.g., apt install texlive-full)');
    
    console.log('\n  Option 2: Install Docker (Alternative)');
    console.log('   - Download from: https://www.docker.com/products/docker-desktop/');
    console.log('\n  Option 3: Use the client-side fallback renderer');
    console.log('   - This option is already set up, but produces less accurate results');
  } else if (!pdflatexInstalled && dockerInstalled) {
    console.log('  Using Docker for LaTeX compilation (already set up)');
    console.log('  To improve performance, you can install a local LaTeX distribution:');
    console.log('   - Windows: Download from https://miktex.org/ or https://tug.org/texlive/');
    console.log('   - macOS: Download MacTeX from https://tug.org/mactex/');
    console.log('   - Linux: Use your package manager (e.g., apt install texlive-full)');
  } else if (pdflatexInstalled) {
    console.log('  Using local LaTeX installation (already set up)');
  }
};

const main = async () => {
  // Create or update .env.local file
  createEnvFile();
  
  // Setup based on available options
  if (dockerInstalled && !pdflatexInstalled) {
    rl.question('\nDo you want to pull the TeX Live Docker image now? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y') {
        setupDocker();
      }
      recommendLatexInstallation();
      rl.close();
    });
  } else {
    recommendLatexInstallation();
    rl.close();
  }
};

// Run the setup
main().catch(error => {
  console.error('Error during setup:', error);
  process.exit(1);
});

// When closing RL
rl.on('close', () => {
  console.log('\n✨ Setup complete!');
  console.log('You can now run "npm run dev" to start your LaTeX editor.');
  console.log('\nNotes:');
  console.log('- If you install TeX Live or Docker later, run this script again');
  console.log('- The editor will automatically use the best available compilation method');
  console.log('- You can manually edit .env.local to change compilation settings\n');
});