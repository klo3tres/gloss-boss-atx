-- Refresh lead playbooks toward buyer-intent search phrases
delete from public.titan_lead_playbooks where workspace_key = 'default';

insert into public.titan_lead_playbooks (
  workspace_key, title, platform, search_query, target_customer, intent_to_find,
  example_phrases, suggested_action, estimated_revenue_min, estimated_revenue_max, priority
) values
('default', 'Who does mobile detailing', 'Facebook', 'who does mobile detailing', 'Local buyer', 'Active detail request', array['ISO detailer','need someone to detail'], 'Search groups — paste post into Lead Radar', 125, 275, 95),
('default', 'Need car detailed', 'Facebook', 'need car detailed', 'Local buyer', 'Ready to book', array['need my car cleaned','looking for detailer'], 'Reply within 24h — past 7 days best', 150, 300, 94),
('default', 'Interior car cleaning', 'Facebook', 'interior car cleaning', 'Interior buyer', 'Interior service', array['inside needs cleaning','seats dirty'], 'Offer interior package + add-ons', 125, 250, 92),
('default', 'Car seat shampoo', 'Facebook', 'car seat shampoo', 'Stain buyer', 'Seat cleaning', array['shampoo seats','deep clean interior'], 'Lead with stain removal results', 150, 275, 91),
('default', 'Stain removal car seat', 'Facebook', 'stain removal car seat', 'Stain buyer', 'Stain removal', array['spill on seat','pet stain'], 'Before/after angle', 175, 300, 90),
('default', 'Mobile detailer near me', 'Facebook', 'mobile detailer near me', 'Mobile buyer', 'Mobile service', array['come to me','mobile detail'], 'Emphasize mobile + Round Rock/Austin', 150, 275, 89),
('default', 'Car detailer recommendation', 'Facebook', 'car detailer recommendation', 'Referral seeker', 'Recommendation thread', array['anyone recommend','who do you use'], 'Short trust reply + DM offer', 125, 250, 88),
('default', 'Anyone know a good detailer', 'Facebook', 'anyone know a good detailer', 'Referral seeker', 'Recommendation', array['good detailer','trustworthy detailer'], 'Social proof + availability', 125, 250, 87),
('default', 'Need my car cleaned', 'Facebook', 'need my car cleaned', 'General buyer', 'General detail', array['car is filthy','need cleaning asap'], 'Offer this week opening', 125, 250, 86),
('default', 'Pet hair car cleaning', 'Facebook', 'pet hair car cleaning', 'Pet owner', 'Pet hair removal', array['dog hair everywhere','pet hair seats'], 'Pet hair add-on', 150, 275, 85),
('default', 'Odor removal car', 'Facebook', 'odor removal car', 'Odor buyer', 'Odor treatment', array['smell in car','smoke odor'], 'Odor removal specialty', 175, 325, 84),
('default', 'Ceramic coating Austin', 'Facebook', 'ceramic coating Austin', 'Premium buyer', 'Ceramic inquiry', array['ceramic quote','coating cost'], 'Qualify + schedule consult', 400, 1200, 70),
('default', 'Mobile detailing Round Rock', 'Facebook', 'mobile detailing Round Rock', 'Round Rock buyer', 'Geo-specific', array['Round Rock detailer','RR mobile detail'], 'Local Round Rock reply', 150, 275, 83),
('default', 'Interior detail Austin', 'Facebook', 'interior detail Austin', 'Austin buyer', 'Interior Austin', array['Austin interior detail','inside detail Austin'], 'Austin mobile interior', 150, 275, 82),
('default', 'Car detailing Pflugerville', 'Facebook', 'car detailing Pflugerville', 'Pflugerville buyer', 'Geo-specific', array['Pflugerville detailer'], 'Expand service area reply', 150, 275, 81),
('default', 'Car detailing Georgetown', 'Facebook', 'car detailing Georgetown', 'Georgetown buyer', 'Geo-specific', array['Georgetown mobile detail'], 'Georgetown availability', 150, 275, 80),
('default', 'Car detailer Nextdoor', 'Nextdoor', 'car detailer', 'Neighbor buyer', 'Local recommendation', array['detailer recommendation'], 'Neighbor-friendly reply', 125, 250, 78),
('default', 'Mobile detailing Nextdoor', 'Nextdoor', 'mobile detailing', 'Mobile neighbor', 'Mobile request', array['mobile detailer near me'], 'Mobile + local trust', 125, 250, 77),
('default', 'Interior cleaning Nextdoor', 'Nextdoor', 'interior cleaning', 'Interior neighbor', 'Interior need', array['inside car cleaning'], 'Interior package', 125, 225, 76),
('default', 'Car wash recommendation', 'Nextdoor', 'car wash recommendation', 'Neighbor', 'Wash vs detail', array['better than car wash'], 'Upgrade to full detail pitch', 100, 200, 75),
('default', 'Apartment complexes Round Rock', 'Google', 'apartment complexes Round Rock TX', 'Property manager', 'B2B apartment', array['resident detail day'], 'B2B outreach script', 800, 5000, 65),
('default', 'Property management Austin', 'Google', 'property management companies Austin TX', 'Property manager', 'B2B PM', array['fleet of resident vehicles'], 'Partnership email', 1000, 8000, 64),
('default', 'Used car dealers Round Rock', 'Google', 'used car dealers Round Rock', 'Dealership', 'Lot detailing', array['inventory detailing'], 'Dealership vendor pitch', 500, 4000, 63),
('default', 'Fleet companies Austin', 'Google', 'fleet companies Austin', 'Fleet owner', 'Fleet service', array['fleet cleaning'], 'Fleet mobile pitch', 800, 6000, 62),
('default', 'RV parks near Austin', 'Google', 'RV parks near Austin', 'RV park', 'RV detailing', array['RV detail mobile'], 'RV/mobile specialty', 300, 2000, 61),
('default', 'Marinas near Austin', 'Google', 'marinas near Austin', 'Marina', 'Boat/marine', array['boat detail'], 'Marine outreach', 400, 3000, 60),
('default', 'Office parks Round Rock', 'Google', 'office parks Round Rock', 'Office park', 'B2B fleet', array['employee car detail'], 'Corporate detail day', 500, 4000, 59),
('default', 'Austin car detailing Reddit', 'Reddit', 'Austin car detailing', 'Reddit buyer', 'Local thread', array['detailer Austin'], 'Helpful non-spam reply', 125, 250, 58),
('default', 'Round Rock car wash Reddit', 'Reddit', 'Round Rock car wash', 'Reddit buyer', 'Local thread', array['mobile detail Round Rock'], 'Mobile upgrade angle', 125, 250, 57),
('default', 'Tesla Austin Reddit', 'Reddit', 'Tesla Austin detailing', 'Tesla owner', 'EV detail', array['Tesla detail Austin'], 'EV-safe products', 175, 350, 56),
('default', 'BMW Austin Reddit', 'Reddit', 'BMW Austin detailing', 'BMW owner', 'Club/group', array['BMW detail Austin'], 'Premium interior pitch', 175, 350, 55);
