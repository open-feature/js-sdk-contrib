export const Tokens = {
  If: ['if', { variadic: true, defaultLength: 2, tips: ['Condition', 'Then', 'Else'] }],
  Equals: ['===', { variadic: false, defaultLength: 2, tips: [] }],
  In: ['in', { variadic: false, defaultLength: 2, tips: ['Search', 'Array/String to Search'] }],
  And: ['and', { variadic: true, defaultLength: 2, tips: [] }],
  Var: ['var', { variadic: false, defaultLength: 1, tips: ['Variable to extract'] }],
  Version: [
    'sem_ver',
    { variadic: false, defaultLength: 3, tips: ['Version to compare', 'Version Expression', 'Version to compare'] },
  ],
} as const; // TODO: labels

export const Operands = ['boolean', 'string', 'number', 'array'] as const;
export type OperandValue = (typeof Operands)[number];

export type TokenKey = keyof typeof Tokens;
export type TokenValue = (typeof Tokens)[TokenKey][0];
export type Operation = { [key in TokenValue]?: [] };
export type AnyOperand = boolean | string | number | Array<number | string>;
