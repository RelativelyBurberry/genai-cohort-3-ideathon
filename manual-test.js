// Manual test of the function
console.log('=== Manual Test of isDemoModeEnabled ===');

// Test the actual function from the file
const fs = require('fs');
const path = require('path');

// Read the file content
const filePath = path.join(__dirname, 'src', 'demo', 'demoConfig.ts');
let content = fs.readFileSync(filePath, 'utf8');
console.log('File content:');
console.log(content.substring(0, 500)); // First 500 chars

// Extract the function
const functionMatch = content.match(/export function isDemoModeEnabled\(\)\s*\{([^}]+)\}/);
if (functionMatch) {
  const functionBody = functionMatch[1];
  console.log('\nFunction body:');
  console.log(functionBody);
} else {
  console.log('\nCould not find function body');
}

// Test the logic directly
console.log('\n=== Testing Logic Directly ===');

function testFlagValue(flag) {
  return flag === 'true';
}

console.log('undefined:', testFlagValue(undefined));
console.log('"" (empty string):', testFlagValue(''));
console.log('"false":', testFlagValue('false'));
console.log('"true":', testFlagValue('true'));
console.log('true (boolean):', testFlagValue(true));
console.log('false (boolean):', testFlagValue(false));