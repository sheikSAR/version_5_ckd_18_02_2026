function missingTable = missingDataReport(T1)

vars = T1.Properties.VariableNames;
nVar = length(vars);
N = height(T1);

% Row numbers
rowNumber = (1:N)';

% Preallocate
missingMatrix = false(N,nVar);

% Detect missing column-wise (handles mixed types)
for j = 1:nVar
    missingMatrix(:,j) = ismissing(T1.(vars{j}));
end

% Count missing per row
missingCount = sum(missingMatrix,2);

% Find missing variables per row
missingVars = cell(N,1);

for i = 1:N
    missingVars{i} = vars(missingMatrix(i,:));
end

% Create table (replace ID if your column name differs)
missingTable = table(rowNumber, T1.ID, missingCount, missingVars,...
    'VariableNames',{'RowNumber','ID','MissingCount','MissingVariables'});

% Keep only rows with missing values
missingTable = missingTable(missingCount>0,:);

disp(missingTable)

end