import { Chip, ChipGroup } from '@dynatrace/strato-components-preview/content';
import { TextInput } from '@dynatrace/strato-components-preview/forms';
import { DataTestId, StylingProps } from '@dynatrace/strato-components/core';
import { Flex } from '@dynatrace/strato-components/layouts';
import Borders from '@dynatrace/strato-design-tokens/borders';
import Colors from '@dynatrace/strato-design-tokens/colors';
import React, { forwardRef, useEffect, useState } from 'react';

/**
 * Properties for the ChipsTextInput. Specify few props of the
 * strings that will be shown as chips.
 */
export interface ChipsTextInputProps extends React.HTMLAttributes<HTMLDivElement>, DataTestId, StylingProps {
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxItems?: number;
  minItems?: number;
}

interface ChipsTextInputContextProps {
  value: string[];
  onValueChange: (value: string[]) => void;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  activeIndex: number;
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>;
}

const ChipsTextInputContext = React.createContext<ChipsTextInputContextProps | null>(null);
const MAX_ITEMS_ALLOWED = 300;

export const ChipsTextInput = forwardRef<HTMLDivElement, ChipsTextInputProps>(
  ({
    value,
    onValueChange,
    placeholder,
    maxItems,
    minItems,
    dir,
    'data-testid': dataTestId,
    className: consumerClassName,
    style: consumerStyle,
  }) => {
    const [activeIndex, setActiveIndex] = useState(-1);
    const [inputValue, setInputValue] = useState<string>('');
    const [disableInput, setDisableInput] = useState(false);
    const [disableButton, setDisableButton] = useState(false);
    const [isValueSelected] = React.useState(false);
    const [selectedValue] = useState('');

    const parseMinItems = minItems ? (minItems > MAX_ITEMS_ALLOWED ? MAX_ITEMS_ALLOWED : minItems) : 0;
    // using maximum values that are allowed.
    const parseMaxItems = maxItems ? (maxItems > MAX_ITEMS_ALLOWED ? MAX_ITEMS_ALLOWED : maxItems) : MAX_ITEMS_ALLOWED;

    const onValueChangeHandler = React.useCallback(
      (val: string) => {
        if (!value.includes(val) && value.length < parseMaxItems) {
          onValueChange([...value, val]);
        }
      },
      [value],
    );

    const onFocusChanged = React.useCallback(() => {
      if (inputValue.trim() !== '') {
        onValueChangeHandler(inputValue);
        setInputValue('');
      }
    }, [inputValue, onValueChangeHandler]);

    const RemoveValue = React.useCallback(
      (val: string) => {
        if (value.includes(val) && value.length > parseMinItems) {
          onValueChange(value.filter((item) => item !== val));
        }
      },
      [onValueChange, parseMinItems, value],
    );

    useEffect(() => {
      const VerifyDisable = () => {
        if (value.length - 1 >= parseMinItems) {
          setDisableButton(false);
        } else {
          setDisableButton(true);
        }
        if (value.length + 1 <= parseMaxItems) {
          setDisableInput(false);
        } else {
          setDisableInput(true);
        }
      };
      VerifyDisable();
    }, [value]);

    const handleKeyDown = React.useCallback(
      async (e: React.KeyboardEvent<HTMLInputElement>) => {
        e.stopPropagation();

        const moveNext = () => {
          const nextIndex = activeIndex + 1 > value.length - 1 ? -1 : activeIndex + 1;
          setActiveIndex(nextIndex);
        };

        const movePrev = () => {
          const prevIndex = activeIndex - 1 < 0 ? value.length - 1 : activeIndex - 1;
          setActiveIndex(prevIndex);
        };

        const moveCurrent = () => {
          const newIndex = activeIndex - 1 <= 0 ? (value.length - 1 === 0 ? -1 : 0) : activeIndex - 1;
          setActiveIndex(newIndex);
        };
        const target = e.currentTarget;

        // ? Suggest : the multi select should support the same pattern

        switch (e.key) {
          case 'ArrowLeft':
            if (dir === 'rtl') {
              if (value.length > 0 && activeIndex !== -1) {
                moveNext();
              }
            } else {
              if (value.length > 0 && target.selectionStart === 0) {
                movePrev();
              }
            }
            break;

          case 'ArrowRight':
            if (dir === 'rtl') {
              if (value.length > 0 && target.selectionStart === 0) {
                movePrev();
              }
            } else {
              if (value.length > 0 && activeIndex !== -1) {
                moveNext();
              }
            }
            break;
          case 'Backspace':
          case 'Delete':
            if (value.length > 0) {
              if (activeIndex !== -1 && activeIndex < value.length) {
                RemoveValue(value[activeIndex]);
                moveCurrent();
              } else {
                if (target.selectionStart === 0) {
                  if (selectedValue === inputValue || isValueSelected) {
                    RemoveValue(value[value.length - 1]);
                  }
                }
              }
            }
            break;

          case 'Escape': {
            const newIndex = activeIndex === -1 ? value.length - 1 : -1;
            setActiveIndex(newIndex);
            break;
          }

          case 'Enter':
            if (inputValue.trim() !== '') {
              e.preventDefault();
              onValueChangeHandler(inputValue);
              setInputValue('');
            }
            break;
        }
      },
      [activeIndex, value, dir, inputValue, RemoveValue, selectedValue, isValueSelected, onValueChangeHandler],
    );

    const handleChange = (v: string) => {
      setInputValue(v);
    };

    return (
      <ChipsTextInputContext.Provider
        value={{
          value,
          onValueChange,
          inputValue,
          setInputValue,
          activeIndex,
          setActiveIndex,
        }}
      >
        <Flex
          gap={6}
          flexWrap="wrap"
          flexDirection="row"
          data-testid={dataTestId}
          className={consumerClassName}
          style={{
            backgroundColor: Colors.Background.Container.Neutral.Default,
            borderRadius: Borders.Radius.Surface.Subdued,
            padding: value.length > 0 ? '1px 1px 1px 6px' : 0,
            ...consumerStyle,
          }}
        >
          {value.length > 0 && (
            <ChipGroup className="flex-1" aria-label="Chips" data-testid="chips-group" defaultExpanded>
              {value.map((item) => (
                <Chip key={item} aria-disabled={disableButton} data-testid="chip-text" variant={'emphasized'}>
                  {item}
                  <Chip.DeleteButton
                    onClick={() => {
                      RemoveValue(item);
                    }}
                  />
                </Chip>
              ))}
            </ChipGroup>
          )}
          <TextInput
            variant="minimal"
            style={{
              backgroundColor: Colors.Background.Field.Neutral.Default,
              border: 'none',
            }}
            aria-label="chips text"
            disabled={disableInput}
            onKeyDown={handleKeyDown}
            onBlur={() => onFocusChanged()}
            value={inputValue}
            onChange={(v) => activeIndex === -1 && handleChange(v)}
            placeholder={placeholder}
          />
        </Flex>
      </ChipsTextInputContext.Provider>
    );
  },
);
