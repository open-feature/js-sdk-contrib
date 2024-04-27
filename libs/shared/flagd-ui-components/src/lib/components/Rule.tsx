import React, { useState } from 'react';
import { AnyOperand, Operation, OperandValue, Operands, TokenValue, Tokens } from '../constants';
import { Arg } from './Arg';

interface RuleProps {
  onChange: (value: Operation | AnyOperand) => void;
}

export function Rule(props: RuleProps) {
  const [operand, setOperand] = useState<AnyOperand | undefined>(undefined);
  const [args, setArgs] = useState<(Operation | AnyOperand)[]>([]);
  const [token, setToken] = useState<TokenValue | OperandValue | undefined>(undefined);

  return (
    <>
      {token ? (
        <div style={{ alignItems: 'center', display: 'flex', flexDirection: 'row' }}>
          <div style={{ margin: '0 1em 0 .5em' }}>{token}</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              flexDirection: 'column',
            }}
          >
            {args.slice(-1).map(() => (
              <>
                <div
                  style={{
                    width: '1em',
                    boxSizing: 'border-box',
                    borderTop: '1px solid grey',
                    borderBottom: '2px solid grey',
                  }}
                ></div>
              </>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              flexDirection: 'column',
              height: '100%',
            }}
          ></div>
          <div>
            {typeof operand === 'boolean' ? (
              <BooleanInput
                checked={operand}
                onChange={(value) => {
                  setOperand(!operand);
                  props.onChange(value);
                }}
              />
            ) : typeof operand === 'string' ? (
              <StringInput
                defaultValue={operand}
                onChange={(value) => {
                  setOperand(value);
                  props.onChange(value);
                }}
              />
            ) : Array.isArray(operand) ? (
              <StringInput
                defaultValue={operand.join(', ')}
                onChange={(value) => {
                  const split = value.split(',').map((value) => value.trim());
                  setOperand(split);
                  props.onChange(split);
                }}
              />
            ) : (
              <>
                {args.map((_, index) => (
                  <div style={{ boxSizing: 'border-box', display: 'flex', flexDirection: 'row' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '1em' }}>
                      <div
                        style={{
                          width: '1em',
                          height: '100%',
                          borderLeft: index != 0 ? '2px solid grey' : '',
                          borderBottom: '1px solid grey',
                        }}
                      ></div>
                      <div
                        style={{
                          width: '1em',
                          height: '100%',
                          borderLeft: index != args.length - 1 ? '2px solid grey' : '',
                          borderTop: '1px solid grey',
                        }}
                      ></div>
                    </div>
                    <div style={{ width: '100%' }}>
                      <Arg
                        key={index}
                        tip={Object.values(Tokens).find((t) => t[0] === token)?.[1].tips[index]}
                        onChange={(payload) => {
                          args[index] = payload;
                          setArgs([...args]);
                          props.onChange({ [token]: args });
                        }}
                      ></Arg>
                    </div>
                  </div>
                ))}
                {Object.values(Tokens).find((t) => t[0] === token)?.[1].variadic ? (
                  <div>
                    <button
                      onClick={() => {
                        setArgs([...args, {}]);
                      }}
                    >
                      ➕
                    </button>
                  </div>
                ) : (
                  <></>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <select
          defaultValue={'DEFAULT'}
          onChange={(e) => {
            const value: TokenValue | OperandValue = e.target.value as TokenValue | OperandValue;
            setToken(value);
            if (value === 'boolean') {
              setOperand(true);
              props.onChange(true);
            } else if (value === 'string') {
              setOperand('');
              props.onChange('');
            } else if (value === 'number') {
              setOperand(0);
              props.onChange(0);
            } else if (value === 'array') {
              setOperand([]);
              props.onChange([]);
            } else {
              const length = Object.values(Tokens).find((t) => t[0] === value)?.[1].defaultLength || 2;
              setArgs(new Array(length).fill(''));
            }
          }}
        >
          <option key="DEFAULT" value={'DEFAULT'} disabled>
            Please select...
          </option>
          <option key="OPERATIONS" value={'OPERATIONS'} disabled>
            Operations
          </option>
          {Object.values(Tokens).map((token) => (
            <option key={token[0]} id={token[0]}>
              {token[0]}
            </option>
          ))}
          <option key="PRIMITIVE" value={'PRIMITIVE'} disabled>
            Primitives
          </option>
          {Operands.map((primitive) => (
            <option key={primitive} id={primitive}>
              {primitive}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

interface BooleanInputProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

function BooleanInput(props: BooleanInputProps) {
  return (
    <input
      type="checkbox"
      checked={props.checked}
      onChange={(e) => {
        props.onChange(e.target.checked);
      }}
    ></input>
  );
}

interface StringInputProps {
  defaultValue: string;
  onChange: (value: string) => void;
}

function StringInput(props: StringInputProps) {
  return (
    <input
      type="text"
      defaultValue={props.defaultValue}
      onChange={(e) => {
        props.onChange(e.target.value);
      }}
    ></input>
  );
}
