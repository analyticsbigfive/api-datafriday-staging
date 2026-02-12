// Test reverse mapping
const reverseMap = {
  'fnb_food': 'fnb-food',
  'fnb_beverages': 'fnb-beverages',
  'fnb_bar': 'fnb-bar',
  'fnb_snack': 'fnb-snack',
  'fnb_icecream': 'fnb-icecream',
  'shop': 'shop',
  'storage': 'storage',
  'hospitality': 'hospitality',
  'access': 'access',
  'entertainment': 'entertainment',
  'entrance': 'entrance',
  'merchshop': 'merchshop',
  'kitchen': 'kitchen',
  'seating': 'seating',
  'stage': 'stage',
  'parking': 'parking',
  'restroom': 'restroom',
  'office': 'office',
  'other': 'other',
};

function reverseMapElementType(type) {
  return reverseMap[type] || type;
}

// Test cases
const testCases = ['fnb_food', 'other', 'merchshop', 'storage'];
testCases.forEach(t => {
  console.log(`${t} -> ${reverseMapElementType(t)}`);
});
