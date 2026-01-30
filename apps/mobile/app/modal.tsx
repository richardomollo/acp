import React from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const WelcomeScreen = () => {
  const navigation = useNavigation();

  const handleContinue = () => {
    //navigation.navigate('Home'); // We'll create Home later
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to ActiveCityPass!</Text>
      <Text style={styles.subtitle}>Your fitness journey starts here.</Text>
      <Button title="Get Started" onPress={handleContinue} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff'
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 32,
    textAlign: 'center'
  }
});

export default WelcomeScreen;
