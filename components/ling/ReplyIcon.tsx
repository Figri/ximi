import {Image} from 'react-native';
import {colors} from '../../constants/theme';
const images={heart:[require('../../assets/ling/heart-outline.png'),require('../../assets/ling/heart-filled.png')],bookmark:[require('../../assets/ling/bookmark-outline.png'),require('../../assets/ling/bookmark-filled.png')]};
export function ReplyIcon({kind,selected}:{kind:'heart'|'bookmark';selected:boolean}){return <Image testID={`reply-icon-${kind}`} source={images[kind][selected?1:0]} accessible={false} style={{width:18,height:18,tintColor:selected?colors.purpleDark:colors.textMuted}}/>;}
