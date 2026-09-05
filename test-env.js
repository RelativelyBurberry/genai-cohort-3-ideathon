// Simple test to verify env var checking
const flag = process.env.VITE_DEMO_MODE;
console.log('flag:', flag);
console.log('flag === true:', flag === true);
console.log('flag === "true":', flag === 'true');
console.log('Boolean(flag):', Boolean(flag));