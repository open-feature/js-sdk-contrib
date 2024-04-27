import { NumberInput, TextInput } from '@dynatrace/strato-components-preview';
import { Button } from '@dynatrace/strato-components/buttons';
import { Container } from '@dynatrace/strato-components/layouts';
import { PlusIcon } from '@dynatrace/strato-icons';
import React, { useState } from 'react';
import { FractionalToken, Node } from '../types';

interface Props {
  node: Node<FractionalToken>;
}

interface Variant {
  id: string;
  name: string;
  weight: number;
}

const generateId = () => Math.random().toString(36).substr(2, 9);
const getColorForVariant = (id: string) => {
  // Generate a color based on the variant's id
  const hue = parseInt(id, 36) % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

const MeterBar = ({ variants }: { variants: Variant[] }) => {
  const totalWeight = variants.reduce((sum, variant) => sum + variant.weight, 0);
  return (
    <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden' }}>
      {variants.map((variant) => {
        const percentage = (variant.weight / totalWeight) * 100;
        return (
          <div
            key={variant.id}
            style={{
              width: `${percentage}%`,
              backgroundColor: getColorForVariant(variant.id),
            }}
          >
            {percentage > 5 && `${variant.name} ${percentage.toFixed(1)}%`}
          </div>
        );
      })}
    </div>
  );
};

export function Fractional(props: Props) {
  const [variants, setVariants] = useState<Variant[]>(
    props.node.fractional.map(([variant, weight]) => {
      return { id: generateId(), name: variant, weight: weight || 1 };
    }),
  );
  const addVariant = () => {
    setVariants([...variants, { id: generateId(), name: `Variant ${variants.length + 1}`, weight: 10 }]);
  };
  const removeVariant = (id: string) => {
    setVariants(variants.filter((v) => v.id !== id));
  };
  const updateVariant = (id: string, field: 'name' | 'weight', value: number | string) => {
    setVariants(variants.map((v) => (v.id === id ? { ...v, [field]: field === 'weight' ? Number(value) : value } : v)));
  };
  return (
    <Container>
      <div>
        <MeterBar variants={variants} />
        {variants.map((variant) => (
          <div style={{ display: 'flex' }} key={variant.id}>
            <div style={{ maxWidth: '1fr' }}>
              {' '}
              <TextInput
                value={variant.name}
                onChange={(value) => {
                  if (value) {
                    updateVariant(variant.id, 'name', value);
                  }
                }}
              />
            </div>

            <div style={{ maxWidth: '3fr' }}>
              <NumberInput
                id={`weight-${variant.id}`}
                value={variant.weight}
                onChange={(value) => {
                  if (value) {
                    updateVariant(variant.id, 'weight', value);
                  }
                }}
                min={0}
                step={1}
              />
            </div>
            <Button onClick={() => removeVariant(variant.id)} disabled={variants.length <= 1}></Button>
          </div>
        ))}
        <Button onClick={addVariant}>
          <PlusIcon /> Add Variant
        </Button>
      </div>
    </Container>
  );
}
