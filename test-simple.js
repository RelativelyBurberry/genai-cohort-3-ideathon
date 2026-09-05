// Simple test to verify the logic works
console.log('=== Simple Logic Test ===');

// Test the exact condition from the function
function testCondition(flag) {
  return flag === 'true';
}

console.log('undefined:', testCondition(undefined));
console.log('null:', testCondition(null));
console.log('"" (empty):', testCondition(''));
console.log('"false":', testCondition('false'));
console.log('"true":', testCondition('true'));
console.log('true (boolean):', testCondition(true));
console.log('false (boolean):', testCondition(false));