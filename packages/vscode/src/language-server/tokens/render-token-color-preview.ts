import { type Dict } from '@pandacss/types'
import { type PandaContext } from '@pandacss/node'
import satori from 'satori'
import { type Token } from '@pandacss/token-dictionary'
import { svgToMarkdownLink } from './utils'
import { parseToRgba } from 'color2k'
import { makeTable } from './render-markdown'
import { traverse } from '@pandacss/shared'

// https://og-playground.vercel.app/?share=5ZTNTsMwDMdfJbLELdI2xHYIgwMfb4DEJZe2cdtAmlRJSqmqvjtNw8ZEGUzihMglsRP_9bMtp4fMCAQGWyFfuCbE-U7hVd-HMyElyqL0jHBYLZdnHGh0t1L4cuYV0tUq6YI_V_i69wfjTlrMvDQ63GZGNZXmEK6HgevrcNgBfEY4rhuVGVm920GKkEnsUG4uGANvEifdR3RYldSPu9TWB5l9U4o5Rlhpkj0X1jRa3BplbIgqLOKY8_5RpCVk8RvgL6BOy-Yk5FQ1eJR4uxiB_0XnOlTKtH-rdRbFj52L-yXXQMHUYTgdsB6m4QZ2vt5QiJDANhcUBKZNASxPlEMKWJkn-dDV4e_w7WSNMrnR_r5KUQDztsGBgk_S8UU5ldBYJWB4Aw
// TODO use raw svg ? or precompile and just replace the color
export const renderTokenColorPreview = async (ctx: PandaContext, token: Token) => {
  const colors = [] as [tokenName: string, value: string][]

  // Add the base token value if it's a color
  if (token.value) {
    // Check if token is a color value (can be hex, rgb, etc.)
    const isColor = typeof token.value === 'string' &&
      (token.value.startsWith('#') ||
        token.value.startsWith('rgb') ||
        token.value.startsWith('hsl') ||
        /^[a-zA-Z]+$/.test(token.value)); // Named colors like 'red', 'blue', etc.

    if (isColor) {
      colors.push(['base', token.value]);
    }
  }

  // Handle conditional values
  if (token.extensions.conditions) {
    Object.entries(token.extensions.conditions).forEach(([conditionName, value]) => {
      if (!ctx.conditions.get(conditionName) && conditionName !== 'base') return
      const [tokenRef] = ctx.tokens.getReferences(value)
      if (!tokenRef) return

      colors.push([conditionName, tokenRef.value])
    })
  }
  if (!colors.length) return

  const svg = await satori(
    createDiv(
      {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
      },
      colors.map(([conditionName, backgroundColor]) =>
        createDiv(
          { height: '100%', flex: 1, padding: '4px', display: 'flex', justifyContent: 'center', backgroundColor },
          createDiv({ height: '100%', padding: '4px', backgroundColor: 'white', color: 'black' }, conditionName),
        ),
      ),
    ),
    {
      width: 256,
      height: 28 * colors.length,
      fonts: [
        {
          name: 'Roboto',
          data: Buffer.from(''),
          weight: 400,
          style: 'normal',
        },
      ],
    },
  )

  return svgToMarkdownLink(svg)
}

const reolveTokenBaseValue = (ctx: PandaContext, token: Token): {base: string, refrence: string, formatted: string, isConditional: boolean} =>  {
  if (token.extensions?.conditions?.base) {
    const baseValue = token.extensions.conditions.base
    const valueToResolve = token.isReference ? token.originalValue : baseValue;
    const resolvedValue = ctx.tokens.deepResolveReference(valueToResolve);
    if (resolvedValue) {
      const formatted = `${resolvedValue} ↔ ${baseValue}`
      return {base: resolvedValue, refrence: baseValue, formatted, isConditional: true}
    }
  }
  return {base: token.value, refrence: '', formatted: token.value, isConditional: false}
}
// New V2 implementation that uses makeColorTile
export const renderTokenColorPreviewV2 = (ctx: PandaContext, token: Token, propName: string, shorthand?: string) => {


  const colorItems = [] as Array<{ name: string; value: string, color: string, isConditional: boolean }>;

  // Add the base token value if it's a color
  if (token.value && typeof token.value === 'string') {
    try {
      const {base, formatted, isConditional} = reolveTokenBaseValue(ctx, token)
      // Try to parse the color to validate it's a color
      parseToRgba(base);
      colorItems.push({ name: 'base', value: formatted, color: base, isConditional });
    } catch {
      // Not a valid color, ignore
    }
  }
  // Build markdown as an array of lines
  const markdownLines: string[] = [];
  
  // check if propName is a shorthand
  if (shorthand !== propName) {
    markdownLines.push(`\`${shorthand}\` is shorthand for \`${propName}\``)
  }

  // Add token description if present
  if (token.description) {
    markdownLines.push(`*${token.description}*`);
    markdownLines.push('');
  }

  // Generate color tiles with labels
  colorItems.forEach(({ name, value, color, isConditional }) => {
    const tile = makeColorTile(color, 10)
    if (!isConditional) {
      markdownLines.push(`${tile} → \`${value}\``);
    } else {
      //make name bold  
      markdownLines.push(`${tile} → **${name}**: \`${value}\``);
    }
    markdownLines.push('');
  });

  const conditionsTable = getConditionsTable(ctx, token)
  if (conditionsTable !== '') {
    markdownLines.push(conditionsTable)
  }

  return markdownLines.join('\n\n');
}

const getConditionsTable = (ctx: PandaContext, token: Token) => {
  const conditions = token.extensions.conditions
  if (!conditions) return ''

  const separator = '[___]'
  const table = [{ color: ' ', theme: 'Condition', value: 'Value' }]

  const tab = '&nbsp;&nbsp;&nbsp;&nbsp;'
  traverse(
    conditions,
    ({ key: cond, value, depth }) => {
      if (!ctx.conditions.get(cond) && cond !== 'base') return
      if(depth === 0 && cond === 'base') {
        return
      }

      const indent = depth > 0 ? tab.repeat(depth) + '├ ' : ''

      if (typeof value === 'object') {
        table.push({
          color: '',
          theme: `${indent}**${cond}**`,
          value: '─────',
        })
        return
      }
      const resolvedValue = ctx.tokens.deepResolveReference(value);
      const [tokenRef] = ctx.tokens.getReferences(value);
      const tokenValue = tokenRef?.value ?? value
      const color = resolvedValue ?? tokenValue
      if (!color) return

      table.push({
        color: makeColorTile(color, 10),
        theme: `${indent}**${cond}**`,
        value: `\`${tokenValue}\``,
      })
    },
    { separator },
  )
  if (table.length === 1) return ''
  return makeTable(table)
}

const squirclePath = `M 0,12 C 0,0 0,0 12,0 24,0 24,0 24,12 24,24 24,24 12,24 0, 24 0,24 0,12`;

const svgCheckerboard = `<defs>
<pattern id="pattern-checker" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
<rect x="0" y="0" width="4" height="4" fill="#fff" />
<rect x="4" y="0" width="4" height="4" fill="#000" />
<rect x="0" y="4" width="4" height="4" fill="#000" />
<rect x="4" y="4" width="4" height="4" fill="#fff" />
</pattern>
</defs>
<path d="${squirclePath}" fill="url(#pattern-checker)" />`;

const makeColorTile = (value: string, size: number) => {
  try {
    const checkHasAlphaTransparency = (value: string) => {
      const colorValue = parseToRgba(value);
      return colorValue[3] !== 1;
    }
    // we have color2k installed use that to parse the color
    const hasAlphaTransparency = checkHasAlphaTransparency(value);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${hasAlphaTransparency ? svgCheckerboard : ''
      }<path d="${squirclePath}" fill="${value}" /></svg>`;
    const image = `![Image](data:image/svg+xml;base64,${btoa(svg)})`;
    return image;
  } catch {
    return '';
  }
};

const createDiv = (style: Dict, children?: DivNode) => ({ type: 'div', key: null, props: { style, children } })
type DivLike = {
  type: string
  key: null
  props: {
    style: Dict
    children: any
  }
}
type DivNode = string | DivLike | DivLike[] | null
