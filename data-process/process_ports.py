import pandas as pd
import sys

df = pd.read_csv(sys.argv[1])
column_mapping = {
    'OID_': 'oid',
    'World Port Index Number': 'wpi_number',
    'Region Name': 'region_name',
    'Main Port Name': 'port_name',
    'Alternate Port Name': 'alt_name',
    'UN/LOCODE': 'port_code',
    'Country Code': 'country_code',
    'World Water Body': 'water_body',
    'Harbor Size': 'harbor_size',
    'Harbor Type': 'harbor_type',
    'Latitude': 'lat',
    'Longitude': 'lon'
}
columns_to_keep = [col for col in column_mapping.keys() if col in df.columns]
df = df[columns_to_keep].rename(columns=column_mapping)

if 'water_body' in df.columns:
    df['water_body'] = df['water_body'].apply(lambda x: x.split(';')[-1].strip() if pd.notna(x) and ';' in str(x) else x)

df.to_csv('port_details.csv', index=False)