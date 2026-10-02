import {Ionicons} from '@expo/vector-icons';
import {useMemo} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import {businessOperationsStyles as styles} from '@/components/BusinessOperationsStyles';
import type {OperationsJob} from '@/lib/business-operations';
import type {ThemeColors} from '@/lib/theme';

const when=(value:string|null)=>value?new Date(value).toLocaleString(undefined,{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'Schedule pending';

export function Section({title,copy,colors}:{title:string;copy:string;colors:ThemeColors}){const s=useMemo(()=>styles(colors),[colors]);return <View style={{flex:1}}><Text style={s.sectionEyebrow}>OPERATIONS</Text><Text style={s.sectionTitle}>{title}</Text><Text style={s.copy}>{copy}</Text></View>}
export function Metric({icon,value,label,colors}:{icon:keyof typeof Ionicons.glyphMap;value:string;label:string;colors:ThemeColors}){const s=useMemo(()=>styles(colors),[colors]);return <View style={s.metric}><Ionicons name={icon} size={17} color={colors.brand}/><Text style={s.metricValue}>{value}</Text><Text style={s.metricLabel}>{label}</Text></View>}
export function Field({label,value,setValue,placeholder,colors}:{label:string;value:string;setValue:(v:string)=>void;placeholder:string;colors:ThemeColors}){const s=useMemo(()=>styles(colors),[colors]);return <View style={{marginTop:11}}><Text style={s.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={setValue} placeholder={placeholder} placeholderTextColor={colors.muted} style={s.input}/></View>}
export function Tag({text,colors}:{text:string;colors:ThemeColors}){const s=useMemo(()=>styles(colors),[colors]);return <View style={s.tag}><Text style={s.tagText}>{text}</Text></View>}
export function Avatar({name,colors}:{name:string;colors:ThemeColors}){const s=useMemo(()=>styles(colors),[colors]);return <View style={s.avatar}><Text style={s.avatarText}>{name.trim().slice(0,1).toUpperCase()||'•'}</Text></View>}
export function Empty({icon,title,copy,colors}:{icon:keyof typeof Ionicons.glyphMap;title:string;copy:string;colors:ThemeColors}){const s=useMemo(()=>styles(colors),[colors]);return <View style={s.empty}><Ionicons name={icon} size={25} color={colors.muted}/><Text style={s.emptyTitle}>{title}</Text><Text style={s.copy}>{copy}</Text></View>}
export function JobCard({job,canAssign,onAssign,colors}:{job:OperationsJob;canAssign:boolean;onAssign?:()=>void;colors:ThemeColors}){const s=useMemo(()=>styles(colors),[colors]);return <View style={s.jobCard}><View style={s.row}><View style={s.source}><Text style={s.sourceText}>{job.source}</Text></View><Text style={s.jobStatus}>{job.status.replaceAll('_',' ')}</Text></View><Text style={s.cardTitle}>{job.label}</Text><Text style={s.customer}>{job.customer_name}</Text><View style={s.jobMeta}><Ionicons name="time-outline" size={14} color={colors.muted}/><Text style={s.meta}>{when(job.scheduled_at)}</Text></View><View style={s.jobMeta}><Ionicons name="location-outline" size={14} color={colors.muted}/><Text style={s.meta}>{job.location||'Location pending'}</Text></View>{canAssign?<Pressable onPress={onAssign} style={s.primary}><Text style={s.primaryText}>OPEN DISPATCH</Text><Ionicons name="arrow-forward" size={16} color={colors.onBrand}/></Pressable>:null}</View>}

