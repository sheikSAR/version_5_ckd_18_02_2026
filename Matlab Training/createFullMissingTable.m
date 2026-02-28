function fullMissingTable = createFullMissingTable(T1)

vars = T1.Properties.VariableNames;
nVar = length(vars);
N = height(T1);

% Row numbers
rowNumber = (1:N)';

% Preallocate missing matrix
missingMatrix = false(N,nVar);

% Detect missing values column-wise (handles mixed types)
for j = 1:nVar
    missingMatrix(:,j) = ismissing(T1.(vars{j}));
end

% Count missing values per row
missingCount = sum(missingMatrix,2);

% Store missing variable names as strings
missingVarsStr = strings(N,1);

for i = 1:N
    mvars = vars(missingMatrix(i,:));
    
    if isempty(mvars)
        missingVarsStr(i) = "None";
    else
        missingVarsStr(i) = strjoin(mvars,", ");
    end
end

% Create final table (replace 'ID' if your column name differs)
fullMissingTable = table( ...
    rowNumber, ...
    T1.ID, ...
    missingCount, ...
    missingVarsStr, ...
    'VariableNames',{'RowNumber','ID','MissingCount','MissingVariables'});

disp(fullMissingTable)

end