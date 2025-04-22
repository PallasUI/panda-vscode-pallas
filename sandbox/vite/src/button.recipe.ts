

import { defineSlotRecipe } from '@pandacss/dev'
 
export const checkboxRecipe = defineSlotRecipe({
  className: 'checkbox',
  description: 'The styles for the Checkbox component',
  slots: ['root', 'control', 'label'],
  base: {
    root: { display: 'flex', alignItems: 'center', gap: '2' },
    control: { borderWidth: '1px', borderRadius: 'sm' },
    label: { marginStart: '2' }
  },
  variants: {
    size: {
      sm: {
        control: { width: '8', height: '8' },
        label: { fontSize: 'sm' }
      },
      md: {
        control: { width: '10', height: '10' },
        label: { fontSize: 'md' }
      }
    }
  },
  defaultVariants: {
    size: 'sm'
  }
})

import { defineRecipe } from "@pandacss/dev";

export const button = defineRecipe({
    className: "btn",
    base: {
        color: "{colors.bg.text}",
        bg: "neutral.50",
        bgColor: "bg.muted",
    },
    variants: {
        size: {
            sm: {
                fontSize: "3xl",
                borderRadius: "{radii.xl}",
                padding: 2,
            },
            md: {
                fontSize: "4xl",
                borderRadius: "{radii.2xl}",
                padding: 2,
            },
            
        }
    }
})