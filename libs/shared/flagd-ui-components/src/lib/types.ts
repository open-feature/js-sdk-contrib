export type AttributeType = 'string' | 'boolean' | 'number' | 'version'; // TODO check this against our attr types
export type Variant = string;

export const DEFAULT_CONDITION = { '': [{ var: [''] }, ''] } as unknown as Node<BinaryTokens>;
export const DEFAULT_SEM_VER_CONDITION = { sem_ver: [{ var: [''] }, '', ''] } as unknown as Node<SemVerToken>;
export const DEFAULT_GROUP = { or: [DEFAULT_CONDITION] };
export const DEFAULT_RULE = [DEFAULT_GROUP, ''];

export const DEFAULT_ATTRIBUTE_CONDITIONS = {
  version: DEFAULT_SEM_VER_CONDITION as Node<AnyToken>,
  string: DEFAULT_CONDITION,
  boolean: DEFAULT_CONDITION,
  number: DEFAULT_CONDITION,
} as const;

export const IF_TOKEN = 'if';
export type IfToken = typeof IF_TOKEN;

export const AND_TOKEN = 'and';
export type AndToken = typeof AND_TOKEN;
export const AND_OP = { token: AND_TOKEN, label: 'All' } as const;

export const OR_TOKEN = 'or';
export type OrToken = typeof OR_TOKEN;
export const OR_OP = { token: OR_TOKEN, label: 'Any' } as const;

export const EQ_TOKEN = '==';
export type EqToken = typeof EQ_TOKEN;
export const EQ_OP = { token: EQ_TOKEN, label: 'Equals' } as const;

export const NOT_EQ_TOKEN = '!=';
export type NotEqToken = typeof NOT_EQ_TOKEN;
export const NOT_EQ_OP = { token: NOT_EQ_TOKEN, label: 'Not Equals' } as const;

export const VAR_TOKEN = 'var';
export type VarToken = typeof VAR_TOKEN;
export const VAR_OP = { token: VAR_TOKEN, label: 'Attribute' } as const;

export const SEM_VER_TOKEN = 'sem_ver';
export type SemVerToken = typeof SEM_VER_TOKEN;
export const SEM_VER_OP = { token: SEM_VER_TOKEN } as const;
export const SEM_VER_EXPRESSIONS = ['^', '~'] as const;
export type SemVerExpression = (typeof SEM_VER_EXPRESSIONS)[number];

export const FRACTIONAL_TOKEN = 'fractional';
export type FractionalToken = typeof FRACTIONAL_TOKEN;
export const FRACTIONAL_OP = { token: FRACTIONAL_TOKEN } as const;
export type FractionalArg = [string] | [string, number];

export const BOOLEAN_OPS = [AND_OP, OR_OP] as const;
export type BooleanTokens = (typeof BOOLEAN_OPS)[number]['token'];
export type BooleanLabels = (typeof BOOLEAN_OPS)[number]['label'];

export const BINARY_OPS = [EQ_OP, NOT_EQ_OP] as const;
export type BinaryTokens = (typeof BINARY_OPS)[number]['token'];
export type BinaryLabels = (typeof BINARY_OPS)[number]['label'];

export type AnyToken = IfToken | AndToken | OrToken | EqToken | NotEqToken | VarToken | SemVerToken | FractionalToken;

export type GroupVariantTuple = [Node<AndToken | OrToken>, Variant];

export interface Attribute {
  type: AttributeType;
  key: string;
}

export interface CommonProps {
  depth: number;
}

export type Node<T extends AnyToken = AnyToken> = {
  // "if" can have binary tokens, all/or tokens, or semver, or be a variant (string)
  [key in T]: T extends IfToken
    ? Partial<Node<BinaryTokens | BooleanTokens | SemVerToken> | string>[] | []
    : // and/or can contain more and/or, binary tokens, or semver
      T extends BooleanTokens
      ? Partial<Node<BinaryTokens | BooleanTokens | SemVerToken>>[]
      : T extends BinaryTokens
        ? // a binary token can only contain an array of length 2 of attribute selection (var), and primitive
          [Node<VarToken>, string]
        : T extends VarToken
          ? // an attribute selection (var) can only contain a string array of length 1 or a string (shorthand)

            [string] | string
          : T extends SemVerToken
            ? // a sem_ver token can only contain an array of length 3 of an attribute selection (var), sem_ver expression, and string
              [Node<VarToken>, SemVerExpression, string]
            : T extends FractionalToken
              ? // fractional can only contain fractional args
                FractionalArg[]
              : T[];
};

const iftoken: Node<IfToken> = {
  if: [
    {
      and: [
        {
          '==': [
            {
              var: 'tenant',
            },
            'abc12345',
          ],
        },
        {
          '!=': [
            {
              var: ['tenant'],
            },
            'def12345',
          ],
        },
        {
          and: [
            {
              '==': [
                {
                  var: ['tenant'],
                },
                'abc12345',
              ],
            },
            {
              '!=': [
                {
                  var: ['tenant'],
                },
                'def12345',
              ],
            },
            {
              sem_ver: [
                {
                  var: ['version'],
                },
                '^',
                '3.0.0',
              ],
            },
          ],
        },
      ],
    },
    'off',
  ],
};
