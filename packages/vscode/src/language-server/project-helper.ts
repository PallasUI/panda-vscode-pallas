import { Position } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { type ParserResultInterface, type ResultItem } from '@pandacss/types'
import { Node, SourceFile, ts } from 'ts-morph'

import { box, type PrimitiveType } from '@pandacss/extractor'
import { type PandaContext } from '@pandacss/node'
import { type ParserResult } from '@pandacss/parser'
import { walkObject } from '@pandacss/shared'
import { extractor, type BoxNodeWithValue } from './extractor'

interface RawToken {
  propName: string
  propValue: PrimitiveType
  propNode: BoxNodeWithValue
  shorthand: string
}

export class ProjectHelper {
  constructor(private getContext: () => PandaContext | undefined) {}

  getSourceFile(doc: TextDocument) {
    const ctx = this.getContext()
    if (!ctx) return

    return ctx.project.getSourceFile(doc.uri) as SourceFile | undefined
  }

  /**
   * Get the local component list of local tokens.
   */
  parseSourceFile(doc: TextDocument) {
    const ctx = this.getContext()
    if (!ctx) return

    const project = ctx.project

    project.addSourceFile(doc.uri, doc.getText())
    return project.parseSourceFile(doc.uri) as ParserResult
  }

  getNodeAtPosition = (doc: TextDocument, position: Position) => {
    const ctx = this.getContext()
    if (!ctx) return

    const sourceFile = this.getSourceFile(doc)
    if (!sourceFile) return

    const charIndex = ts.getPositionOfLineAndCharacter(sourceFile.compilerNode, position.line, position.character)
    return getDescendantAtPos(sourceFile, charIndex)
  }

  /**
   * Get all the tokens from the document and invoke a callback on it.
   */
  getFileTokens(parserResult: ParserResultInterface, onRawToken: (token: RawToken) => void) {
    const ctx = this.getContext()
    if (!ctx) return

    const onResult = (result: ResultItem) => {
      const boxNode = result.box
      if (!boxNode) return
      if (box.isLiteral(boxNode)) return

      result.data.forEach((styles) => {
        const keys = Object.keys(styles)
        if (!keys.length) return

        walkObject(styles, (value, paths) => {
          // if value doesn't exist
          if (value == null) return

          const [prop, ..._allConditions] = ctx.conditions.shift(paths)
          const propNode = box.isArray(boxNode)
            ? boxNode.value.find((node) => box.isMap(node) && extractor.getNestedBoxProp(node, paths))
            : extractor.getNestedBoxProp(boxNode, paths)
          if (!box.isLiteral(propNode) || !prop) return

          const propName = ctx.utility.resolveShorthand(prop)
          onRawToken({ propName, propValue: value, propNode, shorthand: prop })
        })
      })
    }

    parserResult.css.forEach(onResult)
    parserResult.jsx.forEach(onResult)
    parserResult.cva.forEach((item) => {
      const map = item.box
      if (!box.isMap(map)) return
      return item.data.forEach(({ base }) =>
        onResult(Object.assign({}, item, { box: map.value.get('base'), data: [base] })),
      )
    })
    parserResult.sva.forEach((item) => {
      const map = item.box
      if (!box.isMap(map)) return
      return item.data.forEach(({ base }) =>
        onResult(Object.assign({}, item, { box: map.value.get('base'), data: [base] })),
      )
    })
    parserResult.pattern.forEach((set, name) => {
      set.forEach((item) => {
        const map = item.box
        if (!box.isMap(map)) return
        return item.data.forEach((obj) => {
          onResult({ box: map, data: [obj], name, type: 'pattern' })
        })
      })
    })
  }
}

const getDescendantAtPos = (from: Node, pos: number) => {
  let node: Node = from
  const stack: Node[] = [from]

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nextNode: Node | undefined = node.getChildAtPos(pos)
    
    // If we're at a leaf node or can't find a child at position
    if (nextNode == null) {
      // Try to find the most specific node at this position
      const children: Node[] = node.getChildren();
      const containingNodes: Node[] = children.filter((child: Node) => {
        const start = child.getPos();
        const end = child.getEnd();
        return pos >= start && pos <= end;
      });
      
      if (containingNodes.length > 0) {
        // Sort by node length (smaller is more specific)
        const sortedNodes: Node[] = containingNodes.sort((a: Node, b: Node) => 
          (a.getEnd() - a.getPos()) - (b.getEnd() - b.getPos())
        );
        
        
        // Use the most specific (smallest) node that contains our position
        if (sortedNodes[0] && sortedNodes[0] !== node) {
          const mostSpecific = sortedNodes[0];
          node = mostSpecific;
          stack.push(node);
          continue;
        }
      }
      
      // If we have a StringLiteral or NumericLiteral, ensure we're selecting it, not its parent
      const propertyAssignment = node.getKindName() === 'PropertyAssignment' ? node : 
                                 stack.find(n => n.getKindName() === 'PropertyAssignment');
                                 
      if (propertyAssignment && !stack.includes(propertyAssignment)) {
        const initializer = propertyAssignment.getChildrenOfKind(ts.SyntaxKind.StringLiteral)[0] || 
                            propertyAssignment.getChildrenOfKind(ts.SyntaxKind.NumericLiteral)[0];
                            
        if (initializer && pos >= initializer.getPos() && pos <= initializer.getEnd()) {
          console.log('Found more precise literal node:', initializer.getKindName());
          node = initializer;
          stack.push(node);
        }
      }
      return { node, stack }
    } else {
      node = nextNode
      stack.push(node)
    }
  }
}
