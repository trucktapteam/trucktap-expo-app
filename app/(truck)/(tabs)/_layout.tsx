import { Tabs } from 'expo-router';
import { LayoutDashboard } from 'lucide-react-native';
import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import LogoHeader from '@/components/LogoHeader';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';

export default function TruckTabsLayout() {
  const { colors } = useTheme();
  useTruckLifecycleLogger('TruckTabsLayout');
  
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        headerShown: true,
        header: () => <LogoHeader showModeSwitch />,
        tabBarStyle: {
          backgroundColor: colors.cardBackground,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          display: 'none',
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <LayoutDashboard size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
