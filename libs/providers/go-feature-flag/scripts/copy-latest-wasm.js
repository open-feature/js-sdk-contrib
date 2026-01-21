#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Script to copy the go-feature-flag WASM evaluation module
 * This replaces the hardcoded version approach with a configurable one
 */
const TARGET_WASM_VERSION = '0.1.3';

function copyWasmFile() {
  try {
    // Update git submodule first
    console.log('Updating git submodule...');
    execSync('git submodule update --init wasm-releases', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });

    const wasmFileName = `gofeatureflag-evaluation_${TARGET_WASM_VERSION}.wasm`;
    console.log(`Using explicit WASM version: ${TARGET_WASM_VERSION}`);

    const sourcePath = path.join(__dirname, '../wasm-releases/evaluation', wasmFileName);
    const targetPath = path.join(__dirname, '../src/lib/wasm/wasm-module/gofeatureflag-evaluation.wasm');

    // Check if the source file exists
    if (!fs.existsSync(sourcePath)) {
      console.error(`Error: WASM file not found: ${sourcePath}`);
      console.error('Available files in wasm-releases/evaluation:');
      const evaluationDir = path.join(__dirname, '../wasm-releases/evaluation');
      if (fs.existsSync(evaluationDir)) {
        const files = fs.readdirSync(evaluationDir).filter((file) => file.endsWith('.wasm'));
        files.forEach((file) => console.error(`  - ${file}`));
      }
      process.exit(1);
    }

    // Ensure target directory exists
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy the file
    console.log(`Copying ${wasmFileName} to ${targetPath}...`);
    fs.copyFileSync(sourcePath, targetPath);

    console.log('✅ Successfully copied WASM file');
  } catch (error) {
    console.error('Error copying WASM file:', error.message);
    process.exit(1);
  }
}

// Run the script
copyWasmFile();