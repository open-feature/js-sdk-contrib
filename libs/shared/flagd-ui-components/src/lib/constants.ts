type OpType = 'binary' | 'unary' | 'variadic';

export type Token = {
  id: string;
  label: string;
  opType?: OpType;
};

export const Var = 'var';
export type VarOp = typeof Var;

export const If = 'if';
export type IfOp = typeof If;

export const VarToken: Token = { id: 'var', label: 'Context Attribute' } as const;
export const ArrayToken: Token = { id: 'array', label: 'Array' } as const;

// TODO: this could be improved by breaking into separate lists and removing the mapping funcs below
export const OpTokens: Token[] = [
  { id: 'if', label: 'If' },
  // variadic
  { id: 'and', label: 'And', opType: 'variadic' },
  { id: 'or', label: 'Or', opType: 'variadic' },
  { id: '+', label: 'Add', opType: 'variadic' },
  { id: '-', label: 'Subtract', opType: 'variadic' },
  { id: 'max', label: 'Max', opType: 'variadic' },
  { id: 'min', label: 'Min', opType: 'variadic' },
  { id: 'merge', label: 'Merge', opType: 'variadic' },
  { id: 'cat', label: 'Concatenate', opType: 'variadic' },
  // binary
  { id: '===', label: 'Strict Equals', opType: 'binary' },
  { id: '==', label: 'Equals', opType: 'binary' },
  { id: '!==', label: 'Strict Not Equals', opType: 'binary' },
  { id: '!=', label: 'Not Equals', opType: 'binary' },
  { id: 'in', label: 'In', opType: 'binary' },
  { id: 'starts_with', label: 'Starts With', opType: 'binary' },
  { id: 'ends_with', label: 'Ends With', opType: 'binary' },
  { id: '>=', label: 'Equal or Greater Than', opType: 'binary' },
  { id: '>', label: 'Greater Than', opType: 'binary' },
  { id: '<=', label: 'Equal or Less Than', opType: 'binary' },
  { id: '<', label: 'Less Than', opType: 'binary' },
  // unary
  { id: '!', label: 'Negate', opType: 'unary' },
  { id: '!!', label: 'Double Negate', opType: 'unary' },
] as const;

export const PrimitiveTokens: Token[] = [
  { id: 'boolean', label: 'Enabled' },
  { id: 'string', label: 'String' },
  { id: 'number', label: 'Number' },
] as const;

export const DefaultRule = {
  if: [
    {
      '===': [
        {
          var: '',
        },
        [],
      ],
    },
  ],
};

export const DefaultVariadicArg = {
  '===': [
    {
      var: [''],
    },
    [],
  ],
};

export const BinaryOps = OpTokens.map((t) => {
  return t.opType === 'binary' ? t.id : undefined;
}).filter((o) => !!o);
export const UnaryOps = OpTokens.map((t) => {
  return t.opType === 'unary' ? t.id : undefined;
}).filter((o) => !!o);
export const VariadicOps = OpTokens.map((t) => {
  return t.opType === 'variadic' ? t.id : undefined;
}).filter((o) => !!o);

export const AllTokens = [...OpTokens, ...PrimitiveTokens, VarToken] as const;

export type Primitive = boolean | string | number;
export type Arg = Op | Array<Primitive> | Primitive;
export type Op = { [key: string]: Arg[] };
