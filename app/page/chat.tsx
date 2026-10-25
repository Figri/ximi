// 从今天页（或别的页面）点进来、但这个功能不在底栏时：开成一页盖在底栏上面，返回就回到点进来的地方。
// 不再塞进「其他」那一栏的栈里——那样返回会落到「其他」，之后点「其他」还会看到这一页。
import Screen from '../(tabs)/chat';
import { standalonePage } from '../../components/common/StandalonePage';

export default standalonePage(Screen);
