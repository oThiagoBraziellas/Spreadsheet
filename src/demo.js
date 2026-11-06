/** Sample workbook loaded on first visit. */
export const DEMO = {
  A1: 'Item', B1: 'Qty', C1: 'Price', D1: 'Total',
  A2: 'Keyboard', B2: '2', C2: '49.9', D2: '=B2*C2',
  A3: 'Monitor', B3: '1', C3: '189', D3: '=B3*C3',
  A4: 'Cable', B4: '5', C4: '3.5', D4: '=B4*C4',
  A5: 'Mouse', B5: '3', C5: '19.99', D5: '=B5*C5',
  A7: 'Subtotal', D7: '=SUM(D2:D5)',
  A8: 'Tax rate', D8: '8%',
  A9: 'Tax', D9: '=ROUND(D7*D8, 2)',
  A10: 'Grand total', D10: '=D7+D9',
  A12: 'Cheapest', D12: '=MIN(C2:C5)',
  A13: 'Most expensive', D13: '=MAX(C2:C5)',
  A14: 'Average price', D14: '=AVERAGE(C2:C5)',
  A15: 'Big order?', D15: '=IF(D10>500, "yes", "no")',
  F1: 'Try a cycle: set F3 to =F2 and F2 to =F3',
};
