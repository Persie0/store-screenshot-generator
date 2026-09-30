import type { StoreSize } from './platform.ts';

export type TextPlacement={x:number;y:number;width:number;fontSize:number;lineHeight:number;maxLines:2};
export type DevicePlacement={x:number;y:number;width:number;height:number};
export type CreativeComposition={headline:TextPlacement;subheadline:TextPlacement;device:DevicePlacement};

export function getCreativeComposition(size:StoreSize,headlineLines=2,subheadlineLines=2):CreativeComposition {
 const w=size.width,h=size.height;
 if(size.kind==='landscape'){
  const headline:TextPlacement={x:w*.07,y:h*.2,width:w*.5,fontSize:h*.1,lineHeight:h*.112,maxLines:2};
  const subheadline:TextPlacement={x:headline.x,y:headline.y+(headlineLines-1)*headline.lineHeight+headline.fontSize+h*.035,width:w*.5,fontSize:h*.048,lineHeight:h*.058,maxLines:2};
  const deviceHeight=h*.82,deviceWidth=Math.min(w*.25,deviceHeight*.61);
  return {headline,subheadline,device:{x:w*.71,y:h*.09,width:deviceWidth,height:deviceHeight}};
 }
 const left=w*.075,copyWidth=w*.85;
 const headline:TextPlacement={x:left,y:h*.065,width:copyWidth,fontSize:w*.064,lineHeight:w*.071,maxLines:2};
 const subheadline:TextPlacement={x:left,y:headline.y+(headlineLines-1)*headline.lineHeight+headline.fontSize+Math.min(26,h*.012),width:copyWidth,fontSize:w*.028,lineHeight:w*.04,maxLines:2};
 const copyBottom=subheadline.y+(subheadlineLines-1)*subheadline.lineHeight+subheadline.fontSize;
 const deviceGap=Math.min(76,Math.max(52,h*.025));
 const tablet=size.label.includes('iPad'),deviceHeight=h*.72,deviceWidth=Math.min(w*.77,deviceHeight*(tablet?.78:.52));
 return {headline,subheadline,device:{x:(w-deviceWidth)/2,y:copyBottom+deviceGap,width:deviceWidth,height:deviceHeight}};
}
