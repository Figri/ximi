import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../constants/theme';

// Withdraw the unfinished email flow. Keep saved accounts and local data intact.
export default function OsConnect() {
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
    <View style={{padding:24,gap:20}}>
      <Text style={{fontSize:20,color:colors.textPrimary}}>继续使用西米OS</Text>
      <Text style={{fontSize:15,lineHeight:24,color:colors.textSecondary}}>邮件登录入口已收起。习惯和日常记录可以直接使用，无需登录。</Text>
      <Pressable testID="cloud-back-today" onPress={()=>router.replace('/')}><Text style={{color:colors.purpleDark,fontSize:16}}>回到今天</Text></Pressable>
    </View>
  </SafeAreaView>;
}
