import { Tabs } from 'expo-router';
import { Heart, User, Map } from 'lucide-react-native';
import React from 'react';
import { Image } from 'react-native';
import Colors from '@/constants/colors';
import LogoHeader from '@/components/LogoHeader';

const LOGO = require('@/assets/images/icon.png');

export default function CustomerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        headerShown: true,
        header: () => <LogoHeader />,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: Colors.lightGray,
        },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color }) => (
            <Image
              source={LOGO}
              style={{ width: 36, height: 36, resizeMode: 'contain', tintColor: color }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="full-map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <Map size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favorites',
          tabBarIcon: ({ color }) => <Heart size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
