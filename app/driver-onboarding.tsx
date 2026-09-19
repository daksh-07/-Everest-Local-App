import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import {
  DriverApplication,
  DriverDocument,
  DriverDocumentType,
  getDriverApplication,
  getDriverRequirements,
  saveDriverApplication,
  saveDriverVerificationDetails,
  saveDriverVehicle,
  submitDriverApplication,
  uploadDriverDocument,
} from '@/lib/driver';

const STEPS = ['Personal', 'Licence', 'Vehicle', 'Insurance', 'Review'] as const;
const states = ['NSW','ACT','NT','QLD','SA','TAS','VIC','WA','OVERSEAS'];

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', secure = false, editable = true }: {
  label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default'|'numeric'|'email-address'; secure?: boolean; editable?: boolean;
}) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#aaa69f" style={s.input} keyboardType={keyboardType} editable={editable ?? true} autoCapitalize={label.includes('EMAIL') ? 'none' : 'words'} secureTextEntry={secure}/></View>;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[s.choice, selected && s.choiceSelected]}><Text style={[s.choiceText, selected && s.choiceTextSelected]}>{label}</Text></Pressable>;
}

function DocumentCard({ label, hint, type, documents, onUpload, disabled, expiresAt, onSetExpiry, expiryLabel }: {
  label: string; hint: string; type: DriverDocumentType; documents: DriverDocument[]; onUpload: (type: DriverDocumentType, camera: boolean) => void; disabled: boolean; expiresAt?: string; onSetExpiry?: (value: string) => void; expiryLabel?: string;
}) {
  const doc = documents.find(item => item.document_type === type);
  const verified = doc?.status === 'VERIFIED';
  return <View style={s.docCard}>
    <View style={s.docTop}><View style={s.docIcon}><Text style={s.docIconText}>{verified ? '✓' : doc ? '•' : '+'}</Text></View><View style={s.docCopy}><Text style={s.docTitle}>{label}</Text><Text style={s.docHint}>{hint}</Text></View><Text style={[s.badge, verified && s.badgeVerified]}>{verified ? 'VERIFIED' : doc ? 'UPLOADED' : 'REQUIRED'}</Text></View>
    {onSetExpiry && <Field label={expiryLabel ?? 'EXPIRY DATE'} value={expiresAt ?? ''} onChangeText={onSetExpiry} placeholder="YYYY-MM-DD"/>}
    {!disabled && <View style={s.docActions}><Pressable onPress={() => onUpload(type, true)} style={s.smallButton}><Text style={s.smallButtonText}>TAKE PHOTO</Text></Pressable><Pressable onPress={() => onUpload(type, false)} style={s.smallOutline}><Text style={s.smallOutlineText}>CHOOSE PHOTO</Text></Pressable></View>}
    {!!doc?.rejection_reason && <Text style={s.docError}>{doc.rejection_reason}</Text>}
  </View>;
}

function StatusCard({ application }: { application: DriverApplication }) {
  const message = application.status === 'MORE_INFORMATION_REQUIRED'
    ? application.status_reason || 'Everest needs additional information before your application can be approved.'
    : application.status === 'REJECTED'
      ? application.status_reason || 'Your application needs additional information before it can be approved.'
      : application.status === 'SUSPENDED'
        ? application.status_reason || 'Your driver access is currently suspended.'
        : application.status === 'EXPIRED'
          ? 'A required credential has expired. Update it before accepting new delivery work.'
          : 'You won’t be able to accept delivery jobs until verification is complete.';
  return <View style={s.statusCard}><Text style={s.statusEyebrow}>APPLICATION STATUS</Text><Text style={s.statusTitle}>{application.status.replaceAll('_',' ')}</Text><Text style={s.statusCopy}>{message}</Text>{(application.status === 'MORE_INFORMATION_REQUIRED' || application.status === 'REJECTED') && <View style={s.actionNotice}><Text style={s.actionTitle}>Action required</Text><Text style={s.actionCopy}>Update the requested information below and resubmit. Your completed information will be preserved.</Text></View>}</View>;
}

export default function DriverOnboarding() {
  const [application, setApplication] = useState<DriverApplication | null>(null);
  const [requirements, setRequirements] = useState({ require_identity_review: true, require_licence_review: true, require_registration_review: true, require_vehicle_ownership_evidence: true, require_vehicle_photos: true, require_additional_insurance: false });
  const [email, setEmail] = useState('');
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<DriverDocumentType | null>(null);
  const [error, setError] = useState('');

  const [firstName,setFirstName]=useState(''); const [lastName,setLastName]=useState(''); const [dob,setDob]=useState(''); const [phone,setPhone]=useState('');
  const [address,setAddress]=useState(''); const [suburb,setSuburb]=useState(''); const [city,setCity]=useState('Sydney'); const [state,setState]=useState('NSW'); const [postcode,setPostcode]=useState('');
  const [serviceArea,setServiceArea]=useState(''); const [availability,setAvailability]=useState(''); const [notes,setNotes]=useState('');

  const [licenceJurisdiction,setLicenceJurisdiction]=useState('NSW'); const [licenceNumber,setLicenceNumber]=useState(''); const [licenceClass,setLicenceClass]=useState('C'); const [licenceExpiry,setLicenceExpiry]=useState('');
  const [insuranceProvider,setInsuranceProvider]=useState(''); const [insurancePolicy,setInsurancePolicy]=useState(''); const [insuranceExpiry,setInsuranceExpiry]=useState('');

  const [plate,setPlate]=useState(''); const [vehicleState,setVehicleState]=useState('NSW'); const [make,setMake]=useState(''); const [model,setModel]=useState(''); const [year,setYear]=useState(''); const [colour,setColour]=useState(''); const [vehicleType,setVehicleType]=useState('Car'); const [vin,setVin]=useState(''); const [ownership,setOwnership]=useState<'OWNER'|'AUTHORISED_USER'|'EMPLOYER_VEHICLE'>('OWNER'); const [registrationExpiry,setRegistrationExpiry]=useState(''); const [ctpProvider,setCtpProvider]=useState(''); const [ctpExpiry,setCtpExpiry]=useState('');

  useEffect(()=>{let active=true;(async()=>{try{
    const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('Authentication required');
    const [profileResult, app, req]=await Promise.all([supabase.from('profiles').select('phone').eq('id',user.id).maybeSingle(),getDriverApplication(),getDriverRequirements()]);
    if(!active)return; setEmail(user.email ?? ''); setPhone(profileResult.data?.phone ?? ''); setRequirements(req); setApplication(app);
    if(app){setFirstName(app.legal_first_name??'');setLastName(app.legal_last_name??'');setDob(app.date_of_birth??'');setSuburb(app.suburb??'');setCity(app.city??'Sydney');setState(app.state??'NSW');setPostcode(app.postcode??'');setAddress(app.address_line??'');setServiceArea(app.service_area??'');setAvailability(app.availability??'');setNotes(app.notes??'');
      const v=app.verification;if(v){setLicenceJurisdiction(v.licence_jurisdiction??'NSW');setLicenceNumber(v.licence_number??'');setLicenceClass(v.licence_class??'C');setLicenceExpiry(v.licence_expiry??'');setInsuranceProvider(v.insurance_provider??'');setInsurancePolicy(v.insurance_policy_reference??'');setInsuranceExpiry(v.insurance_expiry??'');}
      const vehicle=app.vehicle;if(vehicle){setPlate(vehicle.registration_plate);setVehicleState(vehicle.registration_state);setMake(vehicle.make);setModel(vehicle.model);setYear(vehicle.year?.toString()??'');setColour(vehicle.colour??'');setVehicleType(vehicle.vehicle_type);setVin(vehicle.vin??'');setOwnership(vehicle.ownership_status);setRegistrationExpiry(vehicle.registration_expiry??'');setCtpProvider(vehicle.ctp_provider??'');setCtpExpiry(vehicle.ctp_expiry??'');}
    }
  }catch(e){if(active)setError(e instanceof Error?e.message:'Unable to load your driver application.')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[]);

  const editable = !application || ['DRAFT','MORE_INFORMATION_REQUIRED','REJECTED'].includes(application.status);
  const docs = application?.documents ?? [];
  const requiredDocs = useMemo(()=>[
    requirements.require_identity_review ? 'PROFILE_PHOTO' : null,
    'LICENCE_FRONT','REGISTRATION',
    requirements.require_vehicle_ownership_evidence ? (ownership === 'OWNER' ? 'VEHICLE_OWNERSHIP' : 'VEHICLE_AUTHORIZATION') : null,
    requirements.require_vehicle_photos ? 'VEHICLE_FRONT' : null,
    requirements.require_additional_insurance ? 'INSURANCE' : null,
  ].filter(Boolean) as DriverDocumentType[],[requirements,ownership]);

  async function savePersonal() {
    await saveDriverApplication({legalFirstName:firstName,legalLastName:lastName,dateOfBirth:dob,phone,addressLine:address,suburb,city,state,postcode,serviceArea,availability,notes});
  }
  async function saveLicence() {
    await saveDriverVerificationDetails({licenceJurisdiction,licenceNumber,licenceClass,licenceExpiry,insuranceProvider,insurancePolicyReference:insurancePolicy,insuranceExpiry});
  }
  async function saveVehicle() {
    await saveDriverVehicle({registrationPlate:plate,registrationState:vehicleState,make,model,year:year?Number(year):null,colour,vehicleType,vin,ownershipStatus:ownership,registrationExpiry,ctpProvider,ctpExpiry});
  }
  async function nextStep() {
    setError('');setBusy(true);
    try{
      if(step===0) await savePersonal();
      if(step===1) await saveLicence();
      if(step===2) await saveVehicle();
      if(step===3) await saveLicence();
      const next=Math.min(STEPS.length-1,step+1); setStep(next); setApplication(await getDriverApplication());
    }catch(e){setError(e instanceof Error?e.message:'Could not save this step.')}finally{setBusy(false)}
  }
  async function back(){setError('');if(step>0)setStep(step-1);else router.back()}

  async function pickDocument(type: DriverDocumentType, camera: boolean) {
    if(!application?.id || !editable) return;
    setError('');setUploading(type);
    try{
      const result = camera
        ? await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:0.85,base64:true})
        : await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:0.85,base64:true});
      if(result.canceled || !result.assets[0]) return;
      const asset=result.assets[0];
      let expiry:string|null=null;
      if(type==='LICENCE_FRONT') expiry=licenceExpiry||null;
      if(type==='REGISTRATION') expiry=registrationExpiry||null;
      if(type==='INSURANCE') expiry=insuranceExpiry||null;
      await uploadDriverDocument({applicationId:application.id,vehicleId:application.vehicle?.id??null,documentType:type,asset,expiresAt:expiry});
      setApplication(await getDriverApplication());
    }catch(e){setError(e instanceof Error?e.message:'Document upload failed. Please try again.')}finally{setUploading(null)}
  }

  async function submit() {
    setError('');setBusy(true);
    try{await savePersonal();await saveLicence();await saveVehicle();await submitDriverApplication();setApplication(await getDriverApplication());setStep(4);}
    catch(e){setError(e instanceof Error?e.message:'Your application could not be submitted.')}finally{setBusy(false)}
  }

  if(loading)return <SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:60}}/></SafeAreaView>;
  if(error && !application && !editable)return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.title}>Driver onboarding unavailable</Text><Text style={s.copy}>{error}</Text></View></SafeAreaView>;

  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <View style={s.top}><Pressable onPress={()=>void back()} accessibilityLabel="Go back"><Text style={s.back}>‹</Text></Pressable><Text style={s.topTitle}>Driver verification</Text><View style={{width:28}}/></View>
    <Text style={s.eyebrow}>EVEREST DELIVERY</Text>
    <Text style={s.title}>{application?.status === 'APPROVED' ? 'You’re verified.' : application?.status === 'SUSPENDED' ? 'Driver access suspended.' : 'Become an Everest driver.'}</Text>
    <Text style={s.copy}>Identity, licence, vehicle and supporting documents are reviewed before you can accept delivery work.</Text>
    {application && <StatusCard application={application}/>}
    {application?.status === 'APPROVED' && <Pressable style={s.primary} onPress={()=>router.replace('/delivery')}><Text style={s.primaryText}>OPEN DRIVER DASHBOARD</Text></Pressable>}
    {application?.status === 'EXPIRED' && <View style={s.warning}><Text style={s.warningTitle}>Credential expired</Text><Text style={s.warningCopy}>Update the expired credential below. Driver work remains restricted until Everest completes review again.</Text></View>}
    {editable && <>
      <View style={s.progress}><View style={[s.progressFill,{width:`${((step+1)/STEPS.length)*100}%`}]}/></View>
      <View style={s.stepRow}>{STEPS.map((item,index)=><View key={item} style={s.step}><View style={[s.stepDot,index<=step&&s.stepDotActive]}><Text style={[s.stepNumber,index<=step&&s.stepNumberActive]}>{index+1}</Text></View><Text style={[s.stepLabel,index===step&&s.stepLabelActive]}>{item}</Text></View>)}</View>

      {step===0 && <View>
        <Text style={s.sectionTitle}>1. Personal details</Text><Text style={s.sectionCopy}>Use your legal details. Everest only uses this information for driver verification and operational safety.</Text>
        <Field label="LEGAL FIRST NAME" value={firstName} onChangeText={setFirstName} placeholder="First name"/>
        <Field label="LEGAL LAST NAME" value={lastName} onChangeText={setLastName} placeholder="Last name"/>
        <Field label="DATE OF BIRTH" value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD"/>
        <Field label="PHONE" value={phone} onChangeText={setPhone} placeholder="04xx xxx xxx" keyboardType="numeric"/>
        <Field label="EMAIL" value={email} onChangeText={()=>{}} placeholder="Account email" editable={false}/>
        <Field label="RESIDENTIAL ADDRESS" value={address} onChangeText={setAddress} placeholder="Street address"/>
        <View style={s.two}><View style={s.half}><Field label="SUBURB" value={suburb} onChangeText={setSuburb} placeholder="Suburb"/></View><View style={s.half}><Field label="POSTCODE" value={postcode} onChangeText={setPostcode} placeholder="Postcode" keyboardType="numeric"/></View></View>
        <Field label="CITY" value={city} onChangeText={setCity} placeholder="City"/>
        <Field label="STATE / TERRITORY" value={state} onChangeText={setState} placeholder="NSW"/>
        <Field label="SERVICE AREA" value={serviceArea} onChangeText={setServiceArea} placeholder="e.g. Western Sydney"/>
        <Field label="AVAILABILITY" value={availability} onChangeText={setAvailability} placeholder="e.g. Weekdays 5pm–10pm"/>
        <Field label="OPTIONAL NOTES" value={notes} onChangeText={setNotes} placeholder="Anything relevant"/>
        <DocumentCard label="Profile photo" hint="Used only for identity review." type="PROFILE_PHOTO" documents={docs} onUpload={(t,c)=>void pickDocument(t,c)} disabled={!!uploading} />
      </View>}

      {step===1 && <View>
        <Text style={s.sectionTitle}>2. Driver licence</Text><Text style={s.sectionCopy}>Everest does not treat an uploaded licence as officially verified. For MVP, an authorised admin performs the review. NSW official checks can be added later after legitimate access is obtained.</Text>
        <Text style={s.label}>LICENCE JURISDICTION</Text><View style={s.choices}>{states.map(item=><Choice key={item} label={item} selected={licenceJurisdiction===item} onPress={()=>setLicenceJurisdiction(item)}/>)}</View>
        <Field label="LICENCE NUMBER" value={licenceNumber} onChangeText={setLicenceNumber} placeholder="Licence number"/>
        <Field label="LICENCE CLASS" value={licenceClass} onChangeText={setLicenceClass} placeholder="C"/>
        <Field label="LICENCE EXPIRY" value={licenceExpiry} onChangeText={setLicenceExpiry} placeholder="YYYY-MM-DD"/>
        <DocumentCard label="Licence front" hint="Required for admin review." type="LICENCE_FRONT" documents={docs} onUpload={(t,c)=>void pickDocument(t,c)} disabled={!!uploading} expiresAt={licenceExpiry} onSetExpiry={setLicenceExpiry} expiryLabel="LICENCE EXPIRY"/>
        <DocumentCard label="Licence back" hint="Upload if your jurisdiction issues a two-sided licence." type="LICENCE_BACK" documents={docs} onUpload={(t,c)=>void pickDocument(t,c)} disabled={!!uploading}/>
      </View>}

      {step===2 && <View>
        <Text style={s.sectionTitle}>3. Vehicle & registration</Text><Text style={s.sectionCopy}>You may use a vehicle you own or are authorised to use. Everest does not assume the applicant must be the registered operator.</Text>
        <View style={s.two}><View style={s.half}><Field label="REGISTRATION PLATE" value={plate} onChangeText={setPlate} placeholder="ABC123"/></View><View style={s.half}><Field label="STATE / TERRITORY" value={vehicleState} onChangeText={setVehicleState} placeholder="NSW"/></View></View>
        <View style={s.two}><View style={s.half}><Field label="MAKE" value={make} onChangeText={setMake} placeholder="Toyota"/></View><View style={s.half}><Field label="MODEL" value={model} onChangeText={setModel} placeholder="Corolla"/></View></View>
        <View style={s.two}><View style={s.half}><Field label="YEAR" value={year} onChangeText={setYear} placeholder="2022" keyboardType="numeric"/></View><View style={s.half}><Field label="COLOUR" value={colour} onChangeText={setColour} placeholder="White"/></View></View>
        <Field label="VEHICLE TYPE" value={vehicleType} onChangeText={setVehicleType} placeholder="Car, van, motorcycle"/>
        <Field label="VIN / CHASSIS (IF REQUIRED)" value={vin} onChangeText={setVin} placeholder="Optional where not legitimately required"/>
        <Field label="REGISTRATION EXPIRY" value={registrationExpiry} onChangeText={setRegistrationExpiry} placeholder="YYYY-MM-DD"/>
        <Text style={s.label}>USE OF VEHICLE</Text><View style={s.choices}><Choice label="I own this vehicle" selected={ownership==='OWNER'} onPress={()=>setOwnership('OWNER')}/><Choice label="I am authorised to use it" selected={ownership==='AUTHORISED_USER'} onPress={()=>setOwnership('AUTHORISED_USER')}/><Choice label="Employer / business vehicle" selected={ownership==='EMPLOYER_VEHICLE'} onPress={()=>setOwnership('EMPLOYER_VEHICLE')}/></View>
        <Field label="CTP INSURER (IF KNOWN)" value={ctpProvider} onChangeText={setCtpProvider} placeholder="Provider name"/>
        <Field label="CTP POLICY EXPIRY (IF KNOWN)" value={ctpExpiry} onChangeText={setCtpExpiry} placeholder="YYYY-MM-DD"/>
        <DocumentCard label="Registration evidence" hint="Admin records the official check result separately." type="REGISTRATION" documents={docs} onUpload={(t,c)=>void pickDocument(t,c)} disabled={!!uploading} expiresAt={registrationExpiry} onSetExpiry={setRegistrationExpiry} expiryLabel="REGISTRATION EXPIRY"/>
        <DocumentCard label={ownership==='OWNER'?'Ownership evidence':'Vehicle authorisation'} hint="Evidence must establish your right to use the vehicle." type={ownership==='OWNER'?'VEHICLE_OWNERSHIP':'VEHICLE_AUTHORIZATION'} documents={docs} onUpload={(t,c)=>void pickDocument(t,c)} disabled={!!uploading}/>
        {requirements.require_vehicle_photos && <><DocumentCard label="Vehicle front" hint="Clear exterior photo." type="VEHICLE_FRONT" documents={docs} onUpload={(t,c)=>void pickDocument(t,c)} disabled={!!uploading}/><DocumentCard label="Vehicle rear" hint="Clear exterior photo." type="VEHICLE_REAR" documents={docs} onUpload={(t,c)=>void pickDocument(t,c)} disabled={!!uploading}/><DocumentCard label="Vehicle side" hint="Clear exterior photo." type="VEHICLE_SIDE" documents={docs} onUpload={(t,c)=>void pickDocument(t,c)} disabled={!!uploading}/></>}
      </View>}

      {step===3 && <View>
        <Text style={s.sectionTitle}>4. Insurance</Text><Text style={s.sectionCopy}>CTP is tracked separately from any additional insurance Everest may require. The exact additional-insurance requirement is configurable and is not invented by the app.</Text>
        <Field label="INSURANCE PROVIDER" value={insuranceProvider} onChangeText={setInsuranceProvider} placeholder="Provider name"/>
        <Field label="POLICY REFERENCE" value={insurancePolicy} onChangeText={setInsurancePolicy} placeholder="Policy/reference number"/>
        <Field label="POLICY EXPIRY" value={insuranceExpiry} onChangeText={setInsuranceExpiry} placeholder="YYYY-MM-DD"/>
        <DocumentCard label="Insurance evidence" hint={requirements.require_additional_insurance?'Required for approval.':'Stored for review if Everest requires additional coverage.'} type="INSURANCE" documents={docs} onUpload={(t,c)=>void pickDocument(t,c)} disabled={!!uploading} expiresAt={insuranceExpiry} onSetExpiry={setInsuranceExpiry} expiryLabel="POLICY EXPIRY"/>
        {!requirements.require_additional_insurance && <View style={s.info}><Text style={s.infoTitle}>Additional insurance is not currently configured as a mandatory approval gate.</Text><Text style={s.infoCopy}>This does not change any legal or business insurance obligations outside the app.</Text></View>}
      </View>}

      {step===4 && <View>
        <Text style={s.sectionTitle}>5. Review & submit</Text><Text style={s.sectionCopy}>Review your information. Submission sends the application to Everest admin review. It does not automatically verify your licence, registration or insurance.</Text>
        <View style={s.reviewCard}><Text style={s.reviewTitle}>Identity</Text><Text style={s.reviewRow}>{firstName} {lastName}</Text><Text style={s.reviewRow}>{dob} · {phone}</Text><Text style={s.reviewRow}>{address}, {suburb} {postcode}</Text></View>
        <View style={s.reviewCard}><Text style={s.reviewTitle}>Licence</Text><Text style={s.reviewRow}>{licenceJurisdiction} · Class {licenceClass}</Text><Text style={s.reviewRow}>Expiry {licenceExpiry || 'Not entered'}</Text><Text style={s.reviewRow}>Front document {docs.some(d=>d.document_type==='LICENCE_FRONT')?'uploaded':'missing'}</Text></View>
        <View style={s.reviewCard}><Text style={s.reviewTitle}>Vehicle</Text><Text style={s.reviewRow}>{year || '—'} {make} {model} · {plate}</Text><Text style={s.reviewRow}>{vehicleState} · Registration expires {registrationExpiry || 'not entered'}</Text><Text style={s.reviewRow}>Use: {ownership.replaceAll('_',' ')}</Text></View>
        <View style={s.reviewCard}><Text style={s.reviewTitle}>Verification checklist</Text>{requiredDocs.map(type=><Text key={type} style={s.reviewRow}>{docs.some(d=>d.document_type===type) ? '✓' : '○'} {type.replaceAll('_',' ')}</Text>)}</View>
      </View>}

      {!!error && <Text style={s.error}>{error}</Text>}
      {uploading && <View style={s.uploading}><ActivityIndicator/><Text style={s.uploadingText}>Uploading {uploading.replaceAll('_',' ').toLowerCase()} securely…</Text></View>}
      <View style={s.nav}>
        {step>0 && <Pressable disabled={busy||!!uploading} onPress={()=>void back()} style={s.outline}><Text style={s.outlineText}>BACK</Text></Pressable>}
        {step<4 ? <Pressable disabled={busy||!!uploading} onPress={()=>void nextStep()} style={s.primary}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>{step===3?'REVIEW APPLICATION':'SAVE & CONTINUE'}</Text>}</Pressable> : <Pressable disabled={busy||!!uploading} onPress={()=>void submit()} style={s.primary}>{busy?<ActivityIndicator color="#fff"/>:<Text style={s.primaryText}>SUBMIT FOR REVIEW</Text>}</Pressable>}
      </View>
    </>}
    {!editable && application?.status !== 'APPROVED' && <View style={s.readOnly}><Text style={s.readOnlyTitle}>Verification is controlled by Everest.</Text><Text style={s.readOnlyCopy}>You can view your application status here. If more information is requested, this form will unlock the relevant sections.</Text></View>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#f8f7f4'},page:{padding:20,paddingBottom:60,maxWidth:720,width:'100%',alignSelf:'center'},top:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:24},back:{fontSize:34,fontWeight:'300'},topTitle:{fontSize:16,fontWeight:'800'},eyebrow:{fontSize:9,fontWeight:'900',letterSpacing:2,color:'#777'},title:{fontSize:31,lineHeight:37,fontWeight:'900',marginTop:8},copy:{fontSize:13,lineHeight:20,color:'#777',marginTop:9,marginBottom:20},statusCard:{backgroundColor:'#151515',borderRadius:20,padding:20,marginBottom:18},statusEyebrow:{fontSize:8,fontWeight:'900',letterSpacing:1.4,color:'#aaa'},statusTitle:{fontSize:23,fontWeight:'900',color:'#fff',marginTop:6},statusCopy:{fontSize:12,lineHeight:18,color:'#aaa',marginTop:7},actionNotice:{marginTop:14,borderRadius:14,padding:12,backgroundColor:'#2a2a2a'},actionTitle:{fontSize:11,fontWeight:'900',color:'#fff'},actionCopy:{fontSize:11,lineHeight:17,color:'#bbb',marginTop:4},warning:{backgroundColor:'#fff4dc',borderRadius:16,padding:16,marginBottom:18},warningTitle:{fontSize:14,fontWeight:'900'},warningCopy:{fontSize:12,lineHeight:18,color:'#6d604c',marginTop:4},progress:{height:5,borderRadius:4,backgroundColor:'#e6e2da',overflow:'hidden',marginTop:8},progressFill:{height:5,backgroundColor:'#151515'},stepRow:{flexDirection:'row',justifyContent:'space-between',marginTop:14,marginBottom:25},step:{alignItems:'center',flex:1},stepDot:{width:28,height:28,borderRadius:14,borderWidth:1,borderColor:'#d9d5cd',alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},stepDotActive:{backgroundColor:'#151515',borderColor:'#151515'},stepNumber:{fontSize:10,fontWeight:'800',color:'#777'},stepNumberActive:{color:'#fff'},stepLabel:{fontSize:8,fontWeight:'800',color:'#999',marginTop:5},stepLabelActive:{color:'#151515'},sectionTitle:{fontSize:23,fontWeight:'900'},sectionCopy:{fontSize:12,lineHeight:19,color:'#777',marginTop:6,marginBottom:14},field:{marginTop:11},label:{fontSize:8,fontWeight:'900',letterSpacing:1.05,color:'#777',marginBottom:6},input:{height:50,borderRadius:13,borderWidth:1,borderColor:'#dfdcd5',backgroundColor:'#fff',paddingHorizontal:13,fontSize:14,color:'#151515'},two:{flexDirection:'row',gap:10},half:{flex:1},choices:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:2,marginBottom:6},choice:{minHeight:40,borderRadius:12,borderWidth:1,borderColor:'#ddd8cf',paddingHorizontal:12,alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},choiceSelected:{backgroundColor:'#151515',borderColor:'#151515'},choiceText:{fontSize:10,fontWeight:'800'},choiceTextSelected:{color:'#fff'},docCard:{backgroundColor:'#fff',borderRadius:17,borderWidth:1,borderColor:'#e5e2dc',padding:15,marginTop:12},docTop:{flexDirection:'row',alignItems:'center'},docIcon:{width:34,height:34,borderRadius:17,backgroundColor:'#f1efe9',alignItems:'center',justifyContent:'center'},docIconText:{fontSize:16,fontWeight:'900'},docCopy:{flex:1,paddingHorizontal:10},docTitle:{fontSize:13,fontWeight:'900'},docHint:{fontSize:10,lineHeight:15,color:'#777',marginTop:3},badge:{fontSize:7,fontWeight:'900',letterSpacing:.7,color:'#8a6a24'},badgeVerified:{color:'#2c6842'},docActions:{flexDirection:'row',gap:8,marginTop:12},smallButton:{height:38,borderRadius:10,backgroundColor:'#151515',paddingHorizontal:12,alignItems:'center',justifyContent:'center'},smallButtonText:{color:'#fff',fontSize:8,fontWeight:'900'},smallOutline:{height:38,borderRadius:10,borderWidth:1,borderColor:'#ddd8cf',paddingHorizontal:12,alignItems:'center',justifyContent:'center'},smallOutlineText:{fontSize:8,fontWeight:'900'},docError:{fontSize:11,lineHeight:17,color:'#a12820',marginTop:8},info:{backgroundColor:'#eeece7',borderRadius:14,padding:14,marginTop:12},infoTitle:{fontSize:11,fontWeight:'900'},infoCopy:{fontSize:10,lineHeight:16,color:'#777',marginTop:4},reviewCard:{backgroundColor:'#fff',borderRadius:16,borderWidth:1,borderColor:'#e5e2dc',padding:16,marginTop:10},reviewTitle:{fontSize:13,fontWeight:'900'},reviewRow:{fontSize:11,lineHeight:18,color:'#666',marginTop:5},error:{fontSize:12,lineHeight:18,color:'#a12820',marginTop:14},uploading:{flexDirection:'row',alignItems:'center',gap:8,marginTop:14},uploadingText:{fontSize:11,color:'#777'},nav:{flexDirection:'row',gap:9,marginTop:20},primary:{height:54,borderRadius:14,backgroundColor:'#111',alignItems:'center',justifyContent:'center',paddingHorizontal:18,flex:1},primaryText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:.6},outline:{height:54,borderRadius:14,borderWidth:1,borderColor:'#d8d3ca',alignItems:'center',justifyContent:'center',paddingHorizontal:18},outlineText:{fontSize:10,fontWeight:'900'},center:{flex:1,padding:30,justifyContent:'center',alignItems:'center'},readOnly:{backgroundColor:'#fff',borderRadius:16,padding:16,marginTop:20},readOnlyTitle:{fontSize:13,fontWeight:'900'},readOnlyCopy:{fontSize:11,lineHeight:17,color:'#777',marginTop:5}
});
