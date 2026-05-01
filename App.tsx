import AppNavigator from './app/AppNavigator';
import AuthGate from "./app/services/AuthGate";
import { Provider as PaperProvider } from 'react-native-paper';


export default function App() {
  return (
    <PaperProvider>
      <AuthGate>
        <AppNavigator />
      </AuthGate>
    </PaperProvider>
  ); 
}
