const fs = require('fs');
let content = fs.readFileSync('src/pages/Sessions.tsx', 'utf-8');

const helper = `
  const getStatusColor = (status) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    switch (status.toLowerCase()) {
      case 'completed':
      case 'done':
      case 'submitted':
        return 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200';
      case 'pending':
      case 'committed':
        return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-200';
    }
  };
`;

content = content.replace(/export default function Sessions\(\) \{/, 'export default function Sessions() {\n' + helper);
fs.writeFileSync('src/pages/Sessions.tsx', content);
console.log('Fixed getStatusColor in Sessions.tsx');
