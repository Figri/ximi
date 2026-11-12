import { StyleSheet } from 'react-native';
import { colors, fontSize, radius, spacing } from './theme';

/** 时间与习惯共用的顶部样式。 */
export const timeHeaderStyles = StyleSheet.create({
  headerRow: { flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:spacing.lg,paddingTop:spacing.xs,paddingBottom:spacing.xs,minHeight:44 },
  dateBox:{flexDirection:'row',alignItems:'center',gap:spacing.sm},
  dateText:{fontSize:fontSize.pageTitle,fontWeight:'700',color:colors.textPrimary},
  todayButton:{width:26,height:26,borderRadius:radius.avatar,backgroundColor:colors.blueLight,alignItems:'center',justifyContent:'center'},
  todayButtonText:{fontSize:fontSize.secondary,color:colors.blueDark,fontWeight:'700'},
  headerIcons:{flexDirection:'row',alignItems:'center',gap:8},
  switchRow:{alignItems:'center',paddingTop:2},
  switchBox:{flexDirection:'row',backgroundColor:colors.purpleLight,borderRadius:14,padding:2},
  switchItem:{paddingHorizontal:14,paddingVertical:4,borderRadius:12},
  switchItemOn:{backgroundColor:colors.card,shadowColor:'#000',shadowOpacity:0.08,shadowRadius:3,shadowOffset:{width:0,height:1},elevation:1},
  switchText:{fontSize:12,color:colors.textMuted,fontWeight:'600'},
  switchTextOn:{color:colors.purpleDark,fontWeight:'800'},
});
