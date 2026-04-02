import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

interface QRCodeProps {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
}

export default function QRCode({ 
  value, 
  size = 200, 
  color = '#000000', 
  backgroundColor = '#FFFFFF' 
}: QRCodeProps) {
  const matrix = generateQRMatrix(value);
  const cellSize = size / matrix.length;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Rect width={size} height={size} fill={backgroundColor} />
        {matrix.map((row, y) =>
          row.map((cell, x) => {
            if (cell === 1) {
              return (
                <Rect
                  key={`${x}-${y}`}
                  x={x * cellSize}
                  y={y * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill={color}
                />
              );
            }
            return null;
          })
        )}
      </Svg>
    </View>
  );
}

function generateQRMatrix(value: string): number[][] {
  const size = 29;
  const matrix: number[][] = Array(size).fill(0).map(() => Array(size).fill(0));
  
  const hash = simpleHash(value);
  
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      matrix[i][j] = 1;
      matrix[i][size - 1 - j] = 1;
      matrix[size - 1 - i][j] = 1;
    }
  }
  
  for (let i = 1; i < 6; i++) {
    for (let j = 1; j < 6; j++) {
      matrix[i][j] = 0;
      matrix[i][size - 1 - j] = 0;
      matrix[size - 1 - i][j] = 0;
    }
  }
  
  for (let i = 2; i < 5; i++) {
    for (let j = 2; j < 5; j++) {
      matrix[i][j] = 1;
      matrix[i][size - 1 - j] = 1;
      matrix[size - 1 - i][j] = 1;
    }
  }
  
  for (let i = 8; i < size - 8; i++) {
    for (let j = 8; j < size - 8; j++) {
      const index = (i * (size - 16)) + (j - 8);
      matrix[i][j] = ((hash >> (index % 32)) & 1);
    }
  }
  
  return matrix;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
