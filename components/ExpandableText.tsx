import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import Colors from '@/constants/colors';

type ExpandableTextProps = {
  text: string;
  numberOfLines?: number;
  style?: any;
};

export default function ExpandableText({
  text,
  numberOfLines = 3,
  style,
}: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showReadMore, setShowReadMore] = useState(false);

  const onTextLayout = (e: any) => {
    if (!showReadMore && e.nativeEvent.lines.length > numberOfLines) {
      setShowReadMore(true);
    }
  };

  return (
    <View>
      <Text
        style={[styles.text, style]}
        numberOfLines={isExpanded ? 0 : numberOfLines}
        onTextLayout={onTextLayout}
      >
        {text}
      </Text>

      {showReadMore && (
        <TouchableOpacity onPress={() => setIsExpanded(prev => !prev)}>
          <Text style={styles.readMore}>
            {isExpanded ? 'Read less' : 'Read more'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 15,
    color: Colors.dark,
    lineHeight: 22,
  },
  readMore: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
 });